import { app, InvocationContext } from "@azure/functions";

interface InvoiceChange {
  Item: {
    Id: string;
    [key: string]: any;
  };
}

async function invoicesTrigger(changes: InvoiceChange[], context: InvocationContext): Promise<void> {
  context.log(`SQL Changes Detected: ${JSON.stringify(changes)}`);

  for (const change of changes) {
    // TODO: Process change (e.g., send to Web PubSub)
    context.log(`Processing change for Invoice ID: ${change.Item.Id}`);
  }
}

// Register the SQL trigger with Azure Functions runtime
app.generic("InvoicesTrigger", {
  trigger: {
    type: "sqlTrigger",
    name: "changes",
    tableName: "[dbo].[Invoices]",
    connectionStringSetting: "SqlConnectionString",
  },
  handler: invoicesTrigger,
});

export default invoicesTrigger;
