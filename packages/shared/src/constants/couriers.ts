export interface Courier {
  readonly name: string;
  readonly trackingHost: string;
}

export const COURIERS: readonly Courier[] = [
  { name: 'Delhivery', trackingHost: 'www.delhivery.com' },
  { name: 'Blue Dart', trackingHost: 'www.bluedart.com' },
  { name: 'DTDC', trackingHost: 'www.dtdc.in' },
  { name: 'Ecom Express', trackingHost: 'ecomexpress.in' },
  { name: 'Xpressbees', trackingHost: 'www.xpressbees.com' },
  { name: 'Ekart', trackingHost: 'ekartlogistics.com' },
  { name: 'Shadowfax', trackingHost: 'www.shadowfax.in' },
  { name: 'India Post', trackingHost: 'www.indiapost.gov.in' },
];

export const COURIER_NAMES = COURIERS.map((courier) => courier.name);

export const COURIER_TRACKING_HOSTS = COURIERS.map((courier) => courier.trackingHost);

export const isAllowedCourier = (name: string): boolean => COURIER_NAMES.includes(name);
