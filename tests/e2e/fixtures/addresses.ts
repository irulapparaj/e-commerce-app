/** Tamil Nadu address (SGST + CGST applies when seller is also in TN). */
export const TN_ADDRESS = {
  name: 'Ravi Kumar',
  phone: '9876543210',
  line1: '12 Gandhi Nagar',
  line2: 'Adyar',
  city: 'Chennai',
  state: 'Tamil Nadu',
  pincode: '600020',
  country: 'IN',
} as const;

/** Maharashtra address (IGST applies from TN seller). */
export const MH_ADDRESS = {
  name: 'Priya Sharma',
  phone: '9123456780',
  line1: '45 Shivaji Park',
  line2: 'Dadar',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400028',
  country: 'IN',
} as const;

export type E2EAddress = typeof TN_ADDRESS | typeof MH_ADDRESS;
