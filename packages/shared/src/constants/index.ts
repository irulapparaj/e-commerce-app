export * from './couriers';
export * from './hsn';
export * from './states';

export const FREE_SHIPPING_THRESHOLD_DEFAULT = 59900;
export const RETURN_WINDOW_DAYS_DEFAULT = 15;
export const MAX_CART_QUANTITY = 20;
export const PICKUP_LOCATION_DEFAULT = { city: 'Chennai', state: 'TN', pincode: '600001' } as const;
