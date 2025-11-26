import { AzureFunction, Context } from "@azure/functions"

const trigger: AzureFunction = async function (context: Context, changes: any[]): Promise<void> {
    context.log(`SQL Changes Detected: ${JSON.stringify(changes)}`);
    
    for (const change of changes) {
        // TODO: Process change (e.g., send to Web PubSub)
        context.log(`Processing change for Invoice ID: ${change.Item.Id}`);
    }
};

export default trigger;
