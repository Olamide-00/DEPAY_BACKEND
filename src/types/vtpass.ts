export interface PayBillPayload {
  email: string;
  amount: number;
  serviceID?: string;
  billersCode?: string;
  variation_code?: string;
  phone?: string;
  number?: string;
  pushToken?: string;
  request_id?: string;
  [key: string]: unknown;
}

export interface VTPassTransactionInfo {
  status?: string;
  type?: string;
  total_amount?: string | number;
  commission?: string | number;
  [key: string]: unknown;
}

export interface VTPassPayResponseData {
  code?: string;
  paymentReference?: string;
  token?: string;
  units?: string;
  purchased_code?: string;
  Pin?: string;
  cards?: Array<{ Serial?: string; Pin?: string }>;
  content?: {
    transactions?: VTPassTransactionInfo;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
