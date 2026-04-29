
async function test() {
    try {
        const loginRes = await fetch('http://127.0.0.1:3001/api/auth/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: 'gescall_admin', password: 'TEcnologia2020'})
        });
        const loginData = await loginRes.json();
        
        console.log("Login:", loginData.success);
        if (!loginData.success) {
            console.log(loginData);
            return;
        }

        const pRes = await fetch('http://127.0.0.1:3001/api/campaigns/prefixes', {
            headers: {'Authorization': `Bearer ${loginData.token}`}
        });
        const pData = await pRes.json();
        console.log("Prefixes:", JSON.stringify(pData));
    } catch (e) {
        console.error(e);
    }
}
test();
