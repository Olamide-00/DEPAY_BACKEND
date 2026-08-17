// VTPass is a third-party API whose exact response shape varies by
// service type (airtime vs data vs TV vs electricity vs exam pins all
// return slightly different fields inside `content`/top-level). Fully
// modeling every variant precisely wouldn't add much real safety and
// risks silently being wrong if VTPass changes something — so these
// stay intentionally loose (`unknown`/optional fields for the parts we
// don't branch on), while the fields the codebase actually reads and
// acts on (checked against every access site) are named and typed.

export interface PayBillPayload {
  email: string;
  amount: number;
  percentRev?: number;
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
