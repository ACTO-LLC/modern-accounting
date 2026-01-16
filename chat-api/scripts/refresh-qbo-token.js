/**
 * Force refresh QBO token
 */

import { qboAuth } from '../qbo-auth.js';
import OAuthClient from 'intuit-oauth';
import axios from 'axios';

const DAB_API_URL = 'http://localhost:5000/api';

async function main() {
    try {
        console.log('Loading QBO connections...');
        await qboAuth.loadConnectionsFromDB();

        const qboConn = await qboAuth.getActiveConnection();
        if (!qboConn) {
            console.error('No active QBO connection found');
            process.exit(1);
        }

        console.log(`Found connection: ${qboConn.CompanyName} (${qboConn.RealmId})`);
        console.log(`Current token expiry: ${qboConn.TokenExpiry}`);

        // Create OAuth client
        const oauthClient = new OAuthClient({
            clientId: process.env.QBO_CLIENT_ID || process.env.QUICKBOOKS_CLIENT_ID,
            clientSecret: process.env.QBO_CLIENT_SECRET || process.env.QUICKBOOKS_CLIENT_SECRET,
            environment: qboConn.Environment || 'sandbox',
            redirectUri: process.env.QBO_REDIRECT_URI || 'http://localhost:7071/api/qbo/oauth-callback'
        });

        // Set the current token
        oauthClient.setToken({
            access_token: qboConn.AccessToken,
            refresh_token: qboConn.RefreshToken,
            token_type: 'bearer',
            expires_in: 3600,
            realmId: qboConn.RealmId
        });

        console.log('Forcing token refresh...');

        try {
            const response = await oauthClient.refreshUsingToken(qboConn.RefreshToken);
            const newTokens = response.token;

            console.log('Token refresh successful!');
            console.log(`New access token (first 50): ${newTokens.access_token.substring(0, 50)}...`);

            // Calculate new expiry
            const now = new Date();
            const tokenExpiry = new Date(now.getTime() + (newTokens.expires_in || 3600) * 1000);

            // Update database
            console.log('Updating database...');
            await axios.patch(
                `${DAB_API_URL}/qboconnections/Id/${qboConn.Id}`,
                {
                    AccessToken: newTokens.access_token,
                    RefreshToken: newTokens.refresh_token || qboConn.RefreshToken,
                    TokenExpiry: tokenExpiry.toISOString(),
                    LastUsedAt: new Date().toISOString(),
                    UpdatedAt: new Date().toISOString()
                },
                { headers: { 'Content-Type': 'application/json' } }
            );

            console.log('Database updated successfully!');
            console.log(`New token expiry: ${tokenExpiry.toISOString()}`);

        } catch (refreshError) {
            console.error('Token refresh failed:', refreshError.message);
            console.error('The refresh token may be invalid. Please reconnect to QuickBooks.');
            process.exit(1);
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
