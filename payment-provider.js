// Primary gateway adapter: Selcom Business API.
// Store real credentials only in environment/secret manager.
const config={
 baseUrl:process.env.SELCOM_BASE_URL||"https://sandbox.selcom.business",
 apiKey:process.env.SELCOM_API_KEY,
 apiSecret:process.env.SELCOM_API_SECRET,
 vendor:process.env.SELCOM_VENDOR
};
function assertConfigured(){
 if(!config.apiKey||!config.apiSecret||!config.vendor) throw new Error("Selcom credentials are not configured.");
}
module.exports={config,assertConfigured};
