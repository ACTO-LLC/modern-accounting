import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5000/api', // Direct to DAB, bypassing Vite proxy for this test
    headers: {
        'Content-Type': 'application/json',
    },
});

async function test() {
    const id = 'FA823D35-6C71-4360-BABC-17744D0493E2';
    try {
        console.log(`Testing ID: ${id}`);
        const response = await api.get('/invoices', {
            params: {
                '$filter': `Id eq ${id}`,
                '$expand': 'Lines'
            }
        });
        console.log('Success!');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

test();
