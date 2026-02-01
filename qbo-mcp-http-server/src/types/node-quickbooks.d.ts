declare module 'node-quickbooks' {
  export default class QuickBooks {
    constructor(
      consumerKey: string,
      consumerSecret: string,
      accessToken: string,
      tokenSecret: boolean | string,
      realmId: string,
      useSandbox?: boolean,
      debug?: boolean,
      minorversion?: string | number | null,
      oauthVersion?: string,
      refreshToken?: string
    );

    // Company Info
    getCompanyInfo(realmId: string, callback: (err: any, info: any) => void): void;

    // Customer CRUD
    findCustomers(options: object, callback: (err: any, customers: any) => void): void;
    createCustomer(customerData: object, callback: (err: any, customer: any) => void): void;
    getCustomer(id: string, callback: (err: any, customer: any) => void): void;
    updateCustomer(customerData: object, callback: (err: any, customer: any) => void): void;
    deleteCustomer(idOrEntity: any, callback: (err: any, response: any) => void): void;

    // Invoice CRUD
    findInvoices(options: object, callback: (err: any, invoices: any) => void): void;
    createInvoice(invoiceData: object, callback: (err: any, invoice: any) => void): void;
    getInvoice(id: string, callback: (err: any, invoice: any) => void): void;
    updateInvoice(invoiceData: object, callback: (err: any, invoice: any) => void): void;
    deleteInvoice(idOrEntity: any, callback: (err: any, response: any) => void): void;

    // Account CRUD
    findAccounts(options: object, callback: (err: any, accounts: any) => void): void;
    createAccount(accountData: object, callback: (err: any, account: any) => void): void;
    getAccount(id: string, callback: (err: any, account: any) => void): void;
    updateAccount(accountData: object, callback: (err: any, account: any) => void): void;

    // Vendor CRUD
    findVendors(options: object, callback: (err: any, vendors: any) => void): void;
    createVendor(vendor: object, callback: (err: any, vendor: any) => void): void;
    updateVendor(vendor: object, callback: (err: any, vendor: any) => void): void;
    deleteVendor(vendor: object, callback: (err: any, vendor: any) => void): void;
    getVendor(id: string, callback: (err: any, vendor: any) => void): void;

    // Bill CRUD
    findBills(options: object, callback: (err: any, bills: any) => void): void;
    createBill(bill: object, callback: (err: any, bill: any) => void): void;
    updateBill(bill: object, callback: (err: any, bill: any) => void): void;
    deleteBill(bill: object, callback: (err: any, bill: any) => void): void;
    getBill(id: string, callback: (err: any, bill: any) => void): void;

    // Estimate CRUD
    findEstimates(options: object, callback: (err: any, estimates: any) => void): void;
    createEstimate(estimateData: object, callback: (err: any, estimate: any) => void): void;
    getEstimate(id: string, callback: (err: any, estimate: any) => void): void;
    updateEstimate(estimateData: object, callback: (err: any, estimate: any) => void): void;
    deleteEstimate(idOrEntity: any, callback: (err: any, response: any) => void): void;

    // Employee CRUD
    findEmployees(options: object, callback: (err: any, employees: any) => void): void;
    createEmployee(employeeData: object, callback: (err: any, employee: any) => void): void;
    getEmployee(id: string, callback: (err: any, employee: any) => void): void;
    updateEmployee(employeeData: object, callback: (err: any, employee: any) => void): void;

    // Journal Entry CRUD
    findJournalEntries(options: object, callback: (err: any, journalEntries: any) => void): void;
    createJournalEntry(journalEntryData: object, callback: (err: any, journalEntry: any) => void): void;
    getJournalEntry(id: string, callback: (err: any, journalEntry: any) => void): void;
    updateJournalEntry(journalEntryData: object, callback: (err: any, journalEntry: any) => void): void;
    deleteJournalEntry(idOrEntity: any, callback: (err: any, response: any) => void): void;

    // Payment (Customer Payments) CRUD
    findPayments(options: object, callback: (err: any, payments: any) => void): void;
    createPayment(paymentData: object, callback: (err: any, payment: any) => void): void;
    getPayment(id: string, callback: (err: any, payment: any) => void): void;
    updatePayment(paymentData: object, callback: (err: any, payment: any) => void): void;
    deletePayment(idOrEntity: any, callback: (err: any, response: any) => void): void;

    // Bill Payment CRUD
    findBillPayments(options: object, callback: (err: any, billPayments: any) => void): void;
    createBillPayment(billPaymentData: object, callback: (err: any, billPayment: any) => void): void;
    getBillPayment(id: string, callback: (err: any, billPayment: any) => void): void;
    updateBillPayment(billPaymentData: object, callback: (err: any, billPayment: any) => void): void;
    deleteBillPayment(idOrEntity: any, callback: (err: any, response: any) => void): void;

    // Purchase CRUD
    findPurchases(options: object, callback: (err: any, purchases: any) => void): void;
    createPurchase(purchaseData: object, callback: (err: any, purchase: any) => void): void;
    getPurchase(id: string, callback: (err: any, purchase: any) => void): void;
    updatePurchase(purchaseData: object, callback: (err: any, purchase: any) => void): void;
    deletePurchase(idOrEntity: any, callback: (err: any, response: any) => void): void;

    // Item CRUD
    findItems(options: object, callback: (err: any, items: any) => void): void;
    createItem(itemData: object, callback: (err: any, item: any) => void): void;
    getItem(id: string, callback: (err: any, item: any) => void): void;
    updateItem(itemData: object, callback: (err: any, item: any) => void): void;
  }
}
