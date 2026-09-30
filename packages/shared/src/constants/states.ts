export interface IndianState {
  readonly code: string;
  readonly name: string;
  readonly gstCode: string;
  readonly isUnionTerritory: boolean;
}

export const INDIAN_STATES: readonly IndianState[] = [
  { code: 'JK', name: 'Jammu and Kashmir', gstCode: '01', isUnionTerritory: true },
  { code: 'HP', name: 'Himachal Pradesh', gstCode: '02', isUnionTerritory: false },
  { code: 'PB', name: 'Punjab', gstCode: '03', isUnionTerritory: false },
  { code: 'CH', name: 'Chandigarh', gstCode: '04', isUnionTerritory: true },
  { code: 'UK', name: 'Uttarakhand', gstCode: '05', isUnionTerritory: false },
  { code: 'HR', name: 'Haryana', gstCode: '06', isUnionTerritory: false },
  { code: 'DL', name: 'Delhi', gstCode: '07', isUnionTerritory: true },
  { code: 'RJ', name: 'Rajasthan', gstCode: '08', isUnionTerritory: false },
  { code: 'UP', name: 'Uttar Pradesh', gstCode: '09', isUnionTerritory: false },
  { code: 'BR', name: 'Bihar', gstCode: '10', isUnionTerritory: false },
  { code: 'SK', name: 'Sikkim', gstCode: '11', isUnionTerritory: false },
  { code: 'AR', name: 'Arunachal Pradesh', gstCode: '12', isUnionTerritory: false },
  { code: 'NL', name: 'Nagaland', gstCode: '13', isUnionTerritory: false },
  { code: 'MN', name: 'Manipur', gstCode: '14', isUnionTerritory: false },
  { code: 'MZ', name: 'Mizoram', gstCode: '15', isUnionTerritory: false },
  { code: 'TR', name: 'Tripura', gstCode: '16', isUnionTerritory: false },
  { code: 'ML', name: 'Meghalaya', gstCode: '17', isUnionTerritory: false },
  { code: 'AS', name: 'Assam', gstCode: '18', isUnionTerritory: false },
  { code: 'WB', name: 'West Bengal', gstCode: '19', isUnionTerritory: false },
  { code: 'JH', name: 'Jharkhand', gstCode: '20', isUnionTerritory: false },
  { code: 'OR', name: 'Odisha', gstCode: '21', isUnionTerritory: false },
  { code: 'CG', name: 'Chhattisgarh', gstCode: '22', isUnionTerritory: false },
  { code: 'MP', name: 'Madhya Pradesh', gstCode: '23', isUnionTerritory: false },
  { code: 'GJ', name: 'Gujarat', gstCode: '24', isUnionTerritory: false },
  {
    code: 'DD',
    name: 'Dadra and Nagar Haveli and Daman and Diu',
    gstCode: '26',
    isUnionTerritory: true,
  },
  { code: 'MH', name: 'Maharashtra', gstCode: '27', isUnionTerritory: false },
  { code: 'KA', name: 'Karnataka', gstCode: '29', isUnionTerritory: false },
  { code: 'GA', name: 'Goa', gstCode: '30', isUnionTerritory: false },
  { code: 'LD', name: 'Lakshadweep', gstCode: '31', isUnionTerritory: true },
  { code: 'KL', name: 'Kerala', gstCode: '32', isUnionTerritory: false },
  { code: 'TN', name: 'Tamil Nadu', gstCode: '33', isUnionTerritory: false },
  { code: 'PY', name: 'Puducherry', gstCode: '34', isUnionTerritory: true },
  { code: 'AN', name: 'Andaman and Nicobar Islands', gstCode: '35', isUnionTerritory: true },
  { code: 'TS', name: 'Telangana', gstCode: '36', isUnionTerritory: false },
  { code: 'AP', name: 'Andhra Pradesh', gstCode: '37', isUnionTerritory: false },
  { code: 'LA', name: 'Ladakh', gstCode: '38', isUnionTerritory: true },
];

export const STATE_CODES = INDIAN_STATES.map((state) => state.code);

const BY_CODE: ReadonlyMap<string, IndianState> = new Map(
  INDIAN_STATES.map((state) => [state.code, state]),
);

export const findState = (code: string): IndianState | undefined => BY_CODE.get(code);
