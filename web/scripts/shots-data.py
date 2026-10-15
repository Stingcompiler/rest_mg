"""Realistic review data for the screenshots (docs/ui-profile.md, part C).

Run against a throwaway development database that `manage.py seed` already
filled — never production:

    cd api && DJANGO_SETTINGS_MODULE=config.settings.dev \
      DATABASE_URL=postgres://… python manage.py shell < ../web/scripts/shots-data.py

Adds what the seed lacks and a review needs to see: long names and notes, large
amounts, bills closed on every payment method, open and parked bills, an unpaid
credit account beside a settled one, website orders in every delivery state,
and a kitchen queue. Idempotent enough for a fresh database; run once.
"""
import uuid
from datetime import timedelta

from django.utils import timezone

from apps.catalog.models import MenuItem
from apps.core.models import Branch
from apps.customers.models import Customer
from apps.orders.models import Order, OrderLine, Payment

branch = Branch.objects.first()
items = list(MenuItem.objects.all())
now = timezone.now()
number = [2000]


def make_order(*, status, items_, type_="dine_in", channel="pos", delivery_status="", pay=None, customer=None,
               name="", phone="", address="", notes="", kitchen="", minutes_ago=30):
    number[0] += 1
    at = now - timedelta(minutes=minutes_ago)
    total = sum(i.price_minor * q for i, q in items_)
    order = Order.objects.create(
        id=uuid.uuid4(), branch=branch, number=str(number[0]), type=type_, status=status, channel=channel,
        delivery_status=delivery_status, kitchen_status=kitchen, customer_name=name, customer_phone=phone,
        customer_address=address, customer_notes=notes, subtotal_minor=total, total_minor=total,
        customer_id=customer.id if customer else None, opened_at=at, sent_at=at if status != "open" else None,
        closed_at=at if status == "closed" else None, cashier_name="سمية", created_at=at, updated_at=at,
    )
    for item, qty in items_:
        OrderLine.objects.create(
            id=uuid.uuid4(), branch=branch, order=order, item_id=item.id, name_ar=item.name_ar,
            unit_price_minor=item.price_minor, qty=qty, line_total_minor=item.price_minor * qty, created_at=at, updated_at=at,
        )
    for method, amount, ref in pay or []:
        Payment.objects.create(
            id=uuid.uuid4(), branch=branch, order=order, method=method, amount_minor=amount, reference=ref,
            customer_id=customer.id if method == "credit" and customer else None,
            tendered_minor=amount if method == "cash" else None, taken_at=at, created_at=at, updated_at=at,
        )
    return order


def customer(name, phone):
    return Customer.objects.create(id=uuid.uuid4(), branch=branch, name=name, phone=phone, created_at=now, updated_at=now)


long_name = customer("شركة الأفق للمقاولات والتجارة العامة المحدودة — قسم المشتريات", "0912345001")
small = customer("أحمد", "0912345002")
settled = customer("فاطمة عبدالرحمن", "0912345003")

a, b, c, d, e, f = (items * 2)[:6]
big = [(a, 40), (b, 25), (c, 18)]  # a very large bill

for n in range(14):  # a busy day, every method
    pick = [(items[n % len(items)], 1 + n % 3), (items[(n + 3) % len(items)], 1)]
    total = sum(i.price_minor * q for i, q in pick)
    method = ["cash", "cash", "bank", "wallet"][n % 4]
    make_order(status="closed", items_=pick, pay=[(method, total, "TRX-%05d" % (40000 + n) if method != "cash" else "")], minutes_ago=20 + n * 17)
make_order(status="closed", items_=big, type_="takeaway", pay=[("bank", sum(i.price_minor * q for i, q in big), "TRX-99871")], minutes_ago=15)
make_order(status="closed", items_=[(a, 3), (b, 2)], pay=[("credit", sum(i.price_minor * q for i, q in [(a, 3), (b, 2)]), "")], customer=long_name, minutes_ago=50)
make_order(status="closed", items_=[(c, 40)], pay=[("credit", c.price_minor * 40, "")], customer=long_name, minutes_ago=70)
make_order(status="closed", items_=[(d, 1)], pay=[("credit", d.price_minor, "")], customer=small, minutes_ago=90)
make_order(status="closed", items_=[(e, 2)], pay=[("credit", e.price_minor * 2, "")], customer=settled, minutes_ago=110)

make_order(status="sent", items_=[(a, 2), (b, 1)], kitchen="queued", minutes_ago=4)
make_order(status="sent", items_=[(c, 1), (d, 3), (e, 2)], kitchen="preparing", minutes_ago=11)
make_order(status="sent", items_=[(f, 2)], type_="takeaway", kitchen="ready", minutes_ago=18)
make_order(status="parked", items_=[(a, 1)], minutes_ago=25)
make_order(status="open", items_=[(b, 2), (c, 2)], minutes_ago=2)

address = "شارع النيل، عمارة الفيصل، الطابق الثالث، شقة ١٢، بجوار الصيدلية الكبيرة، الخرطوم ٢"
notes = "بدون بصل والكبدة حارة جدًا من فضلكم، واتصلوا قبل الوصول بعشر دقائق، والبوابة الخضراء على اليمين"
for i, (state, kitchen) in enumerate([("pending", ""), ("pending", ""), ("confirmed", "queued"), ("preparing", "preparing"),
                                       ("out_for_delivery", "ready"), ("delivered", "ready")]):
    make_order(status="sent" if state != "delivered" else "sent", items_=[(items[i % len(items)], 2), (items[(i + 2) % len(items)], 1)],
               type_="delivery", channel="online", delivery_status=state, kitchen=kitchen,
               name=["أحمد محمد عبدالله الطيب", "سارة", "عمر", "فاطمة", "خالد", "مها"][i], phone="09123456%02d" % (10 + i),
               address=address if i % 2 == 0 else "حي الرياض", notes=notes if i == 0 else "", minutes_ago=6 + i * 9)

print("review data added:", Order.objects.count(), "orders,", Customer.objects.count(), "customers")
