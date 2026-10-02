"""Additional audit probes: settled credit and uploaded content type."""
import uuid
from django.test import TestCase, override_settings
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from apps.customers.models import Customer
from apps.orders.models import Order, Payment
from tests.factories import make_branch, make_manager, make_category, make_item

class AdditionalReviewProbes(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.client = APIClient()
        self.client.force_authenticate(make_manager(branch=self.branch))

    def test_settled_credit_is_not_outstanding(self):
        now = timezone.now()
        person = Customer.objects.create(id=uuid.uuid4(), branch=self.branch, name='Audit', created_at=now, updated_at=now)
        order = Order.objects.create(id=uuid.uuid4(), branch=self.branch, number='audit-credit', status='closed',
            subtotal_minor=25000, total_minor=25000, opened_at=now, closed_at=now, created_at=now, updated_at=now)
        Payment.objects.create(id=uuid.uuid4(), branch=self.branch, order=order, method='credit', amount_minor=25000,
            customer_id=person.id, taken_at=now, created_at=now, updated_at=now)
        response = self.client.post(f'/api/v1/customers/{person.id}/settle/',
            {'amount_minor':'25000', 'method':'cash'}, format='json')
        self.assertEqual(response.status_code, 201)
        report = self.client.get('/api/v1/reports/revenue/').data
        print('AUDIT_SETTLEMENT', {'customer_balance':response.data['balance_minor'], 'report_outstanding':report['credit_outstanding_minor'], 'report_collected':report['collected_minor']})
        self.assertEqual(report['credit_outstanding_minor'], '0')

    def test_html_upload_is_not_served_as_html(self):
        item = make_item(branch=self.branch, category=make_category(branch=self.branch))
        response = self.client.post(f'/api/v1/catalog/items/{item.id}/image/',
            {'image':SimpleUploadedFile('audit.html', b'<html>audit only</html>', content_type='text/html')}, format='multipart')
        self.assertEqual(response.status_code, 200)
        item.refresh_from_db()
        self.addCleanup(item.image.delete, save=False)
        public_response = APIClient().get(item.image.url)
        self.assertEqual(public_response.status_code, 200)
        print('AUDIT_MEDIA_TYPE', public_response.status_code, public_response['Content-Type'])
        self.assertNotEqual(public_response['Content-Type'].split(';')[0], 'text/html')
