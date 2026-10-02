"""Independent audit probes. Assertions describe the required safe behaviour."""
import io
import uuid
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.accounts.models import ManagerUser
from apps.orders.models import Order
from apps.profiles.models import RestaurantProfile
from tests.factories import make_branch, make_manager, make_category, make_item, make_device, order_payload, envelope, record

class ReviewProbes(TestCase):
    def setUp(self):
        self.branch_a = make_branch(name_ar='Audit A')
        self.branch_b = make_branch(name_ar='Audit B')
        self.user = make_manager(branch=self.branch_a, username='audit-manager')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.cat_a = make_category(branch=self.branch_a)
        self.cat_b = make_category(branch=self.branch_b)
        self.item_b = make_item(branch=self.branch_b, category=self.cat_b)

    def profile(self, branch=None):
        now = timezone.now()
        return RestaurantProfile.objects.create(id=uuid.uuid4(), branch=branch or self.branch_a,
            slug='audit-restaurant', name_ar='Audit Restaurant', landing_page_enabled=True,
            created_at=now, updated_at=now)

    def online_order(self):
        self.profile()
        item = make_item(branch=self.branch_a, category=self.cat_a)
        payload = dict(customer_name='Audit customer', customer_phone='0912345678',
            customer_address='Audit street', items=[dict(item_id=str(item.id), qty=1)])
        response = APIClient().post('/api/v1/public/order/', payload, format='json')
        self.assertEqual(response.status_code, 201)
        return Order.objects.get(id=response.data['id']), payload

    def test_01_catalog_list_is_branch_scoped(self):
        result = self.client.get('/api/v1/catalog/items/').data
        self.assertNotIn(str(self.item_b.id), [i['id'] for i in result])

    def test_02_order_detail_is_branch_scoped(self):
        order = Order.objects.create(id=uuid.uuid4(), branch=self.branch_b, number='B-1',
            opened_at=timezone.now(), status='sent', type='dine_in')
        response = self.client.get(f'/api/v1/orders/{order.id}/')
        self.assertEqual(response.status_code, 404)

    def test_03_sync_cannot_reassign_another_branch_order(self):
        device_b, token_b = make_device(self.branch_b)
        client_b = APIClient()
        client_b.credentials(HTTP_AUTHORIZATION='Device ' + token_b)
        payload = order_payload(status='sent')
        response = client_b.post('/api/v1/sync/push/', envelope(record('order', payload)), format='json')
        self.assertEqual(response.data['accepted'], 1)
        device_a, token_a = make_device(self.branch_a)
        client_a = APIClient()
        client_a.credentials(HTTP_AUTHORIZATION='Device ' + token_a)
        payload['status'] = 'closed'
        response = client_a.post('/api/v1/sync/push/', envelope(record('order', payload)), format='json')
        order = Order.objects.get(id=payload['id'])
        self.assertEqual(order.branch_id, self.branch_b.id)

    def test_04_cookie_writes_require_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        client.cookies['sp_access'] = str(RefreshToken.for_user(self.user).access_token)
        response = client.post('/api/v1/catalog/categories/',
            dict(id=str(uuid.uuid4()), name_ar='CSRF audit'), format='json',
            HTTP_ORIGIN='https://untrusted.example')
        self.assertEqual(response.status_code, 403)

    def test_05_uploaded_image_is_validated_server_side(self):
        upload = SimpleUploadedFile('audit.html', b'<html>audit only</html>', content_type='text/html')
        response = self.client.post(f'/api/v1/catalog/items/{self.item_b.id}/image/',
            dict(image=upload), format='multipart')
        self.assertEqual(response.status_code, 400)

    def test_06_cancelled_delivery_leaves_kitchen_queue(self):
        order, _ = self.online_order()
        response = self.client.post(f'/api/v1/orders/{order.id}/delivery-status/',
            dict(delivery_status='cancelled'), format='json')
        self.assertEqual(response.status_code, 200)
        ids = [t['id'] for t in self.client.get('/api/v1/kitchen/tickets/').data['tickets']]
        self.assertNotIn(str(order.id), ids)

    def test_07_retried_public_order_is_not_duplicated(self):
        order, payload = self.online_order()
        response = APIClient().post('/api/v1/public/order/', payload, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Order.objects.filter(channel='online').count(), 1)

    def test_08_featured_items_have_active_categories(self):
        profile = self.profile()
        item = make_item(branch=self.branch_a, category=self.cat_a, is_featured=True)
        self.cat_a.is_active = False
        self.cat_a.save()
        result = APIClient().get('/api/v1/public/').data
        self.assertNotIn(str(item.id), [i['id'] for i in result['featured']])

    def test_09_kitchen_does_not_prepare_unconfirmed_delivery(self):
        order, _ = self.online_order()
        response = self.client.post(f'/api/v1/kitchen/tickets/{order.id}/status/',
            dict(kitchen_status='preparing'), format='json')
        order.refresh_from_db()
        self.assertEqual(order.delivery_status, 'pending')

    def test_10_delivered_order_has_a_payment_path_observation(self):
        order, _ = self.online_order()
        self.client.post(f'/api/v1/orders/{order.id}/delivery-status/',
            dict(delivery_status='confirmed'), format='json')
        self.client.post(f'/api/v1/kitchen/tickets/{order.id}/status/',
            dict(kitchen_status='ready'), format='json')
        self.client.post(f'/api/v1/orders/{order.id}/delivery-status/',
            dict(delivery_status='out_for_delivery'), format='json')
        self.client.post(f'/api/v1/orders/{order.id}/delivery-status/',
            dict(delivery_status='delivered'), format='json')
        order.refresh_from_db()
        print('AUDIT_DELIVERED_PAYMENT', order.status, order.amount_paid_minor, order.amount_due_minor)
        self.assertEqual(order.delivery_status, 'delivered')
        self.assertEqual(order.amount_paid_minor, 0)
