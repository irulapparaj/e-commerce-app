export interface Courier {
  readonly name: string;
  readonly trackingHost: string;
  /** URL template with {awb} placeholder */
  readonly trackingUrlTemplate: string;
}

export const COURIERS: readonly Courier[] = [
  {
    name: 'Delhivery',
    trackingHost: 'www.delhivery.com',
    trackingUrlTemplate: 'https://www.delhivery.com/tracking/?trackingId={awb}',
  },
  {
    name: 'Blue Dart',
    trackingHost: 'www.bluedart.com',
    trackingUrlTemplate: 'https://www.bluedart.com/tracking?trackFor={awb}',
  },
  {
    name: 'DTDC',
    trackingHost: 'www.dtdc.in',
    trackingUrlTemplate: 'https://www.dtdc.in/tracking/?track_type=cpv&strCnNo={awb}',
  },
  {
    name: 'Ecom Express',
    trackingHost: 'ecomexpress.in',
    trackingUrlTemplate: 'https://ecomexpress.in/tracking/?awb_field={awb}',
  },
  {
    name: 'Xpressbees',
    trackingHost: 'www.xpressbees.com',
    trackingUrlTemplate: 'https://www.xpressbees.com/shipment/tracking/?shipmentNo={awb}',
  },
  {
    name: 'Ekart',
    trackingHost: 'ekartlogistics.com',
    trackingUrlTemplate: 'https://ekartlogistics.com/shipmenttrack/{awb}',
  },
  {
    name: 'Shadowfax',
    trackingHost: 'www.shadowfax.in',
    trackingUrlTemplate: 'https://www.shadowfax.in/track?awb={awb}',
  },
  {
    name: 'India Post',
    trackingHost: 'www.indiapost.gov.in',
    trackingUrlTemplate: 'https://www.indiapost.gov.in/vas/pages/trackConsignment.aspx?consignment={awb}',
  },
  {
    name: 'FedEx',
    trackingHost: 'www.fedex.com',
    trackingUrlTemplate: 'https://www.fedex.com/fedextrack/?tracknumbers={awb}',
  },
  {
    name: 'Shiprocket',
    trackingHost: 'app.shiprocket.in',
    trackingUrlTemplate: 'https://shiprocket.co/tracking/{awb}',
  },
];

export const COURIER_NAMES = COURIERS.map((courier) => courier.name);

export const COURIER_TRACKING_HOSTS = COURIERS.map((courier) => courier.trackingHost);

/** Map of courier name → URL template with `{awb}` placeholder. */
export const COURIER_TRACKING_URLS: Readonly<Record<string, string>> = Object.fromEntries(
  COURIERS.map((c) => [c.name, c.trackingUrlTemplate]),
);

export const isAllowedCourier = (name: string): boolean => COURIER_NAMES.includes(name);
