"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const dotenv = tslib_1.__importStar(require("dotenv"));
// Load environment variables
dotenv.config();
// Transaction IDs from the log
const transactionIds = [
    '4f6e9ef21e2f8ebd4d7e2a4658199333104ced336ffaae844d01633d9e2b8412',
    'b82cee088fd2de2010b98a7fa1a50b1499702c3fa51019088e24c82354ce711f',
    'b318aea725e40abf7a8fca5cc3039a295f36657ef3eab22c0eb03fb88bbc6dab',
    '92349266d2a3ac7eccecdc30d96e5724c85da574ffae2b0fc865d9c0a8ff8431',
    '2a08c952d92c8e78eb80ee7e606d299641258b346f3961eb3b3f99829e667a82',
    '8647a38c49c08a42f3f09adbe9970235d23bd8dd158dd2e993ebe02ce75e2c3a',
    '7adf903fe441732628070c891aa338aec4c2296ada8e68366190a17cf970f1f7',
    '2a1b56cef94e936d076f9ad64f6735cc2411dfc61b7c6e6b219fd87c36ee79ae',
    '0184c5c0f235906346fc82955df83bd77967cde2a22456d9d91e92c00e2a4b33',
    'a62682c5976dd8331b72b397d125dfd995fb5769056ac4dccfc5cd67d4131707',
    'ff684b1635b08bdc4946c40125010dd9712f7439fc3d739447deead6be69e6cb',
    '4574763ac82a3442061e010720903cbe070eaf19de2faa61e57fb49d1a9a8578',
    'd8dc4e00531e8a555526cc706a7327f0c403425ea1e29f9d22ec4053231c308f',
    '674db3023e6d384dbbe29a96e5fe68df380da0900d7dd902b38244755dfc3287',
    '5718c40798cdf889216ed62cbe405a71ba3cbb883ed8eb4bcd41a244f355f3e0',
    '1a1509ba9b8aad741ee58c03d4041ecd596f1a1092deeeccb04dcf2a9eb8de5e',
    '5cce9a9c69f722010c2e7655e359a5fe49be43be929a7c7835e7d62c719134eb',
    '741056e38e160ed1c7607e452d58d644afca43f413d6f50a12ac3570f45e7578',
    '4ee3dfe0abfdd83f4f3ec90d7ef0667cf352631247e1eb251a29682d27fb4658',
    '293426b46227d915baf01f9f1c2010165c52260d9c131565bfcc3dabc4f7b3c4'
];
async function checkTransactionStatus() {
    const targetHeight = 900005;
    let confirmedInTarget = 0;
    let confirmedInOther = 0;
    let pending = 0;
    console.log(`🔍 Checking status of ${transactionIds.length} clock-in transactions...`);
    console.log(`🎯 Target block: ${targetHeight}`);
    console.log('');
    for (let i = 0; i < transactionIds.length; i++) {
        const txId = transactionIds[i];
        try {
            const response = await fetch(`https://blockstream.info/api/tx/${txId}`);
            if (response.ok) {
                const txInfo = await response.json();
                if (txInfo.status && txInfo.status.confirmed) {
                    const confirmedHeight = txInfo.status.block_height;
                    if (confirmedHeight === targetHeight) {
                        confirmedInTarget++;
                        console.log(`✅ Wallet ${i}: CONFIRMED in TARGET block ${targetHeight}`);
                    }
                    else {
                        confirmedInOther++;
                        console.log(`✅ Wallet ${i}: CONFIRMED in block ${confirmedHeight} (target was ${targetHeight})`);
                    }
                }
                else {
                    pending++;
                    console.log(`⏳ Wallet ${i}: PENDING`);
                }
            }
            else {
                pending++;
                console.log(`❓ Wallet ${i}: UNKNOWN (API error)`);
            }
        }
        catch (error) {
            pending++;
            console.log(`❌ Wallet ${i}: ERROR - ${error.message}`);
        }
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('');
    console.log(`📊 FINAL SUMMARY:`);
    console.log(`   ✅ Confirmed in target block (${targetHeight}): ${confirmedInTarget}`);
    console.log(`   ✅ Confirmed in other blocks: ${confirmedInOther}`);
    console.log(`   ⏳ Still pending: ${pending}`);
    console.log(`   📈 Total success rate: ${((confirmedInTarget + confirmedInOther) / transactionIds.length * 100).toFixed(1)}%`);
    console.log(`   🎯 Target block success rate: ${(confirmedInTarget / transactionIds.length * 100).toFixed(1)}%`);
}
// Run the check
checkTransactionStatus().catch(console.error);
//# sourceMappingURL=check-clock-in-status.js.map