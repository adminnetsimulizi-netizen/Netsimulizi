const config = require('./config');
function splitRevenue(grossAmount, promoted=false) {
  const a = promoted ? config.revenue.promotedAuthorPercent : config.revenue.standardAuthorPercent;
  const p = promoted ? config.revenue.promotedPlatformPercent : config.revenue.standardPlatformPercent;
  return {grossAmount, authorPercent:a, platformPercent:p,
          authorAmount:grossAmount*a/100, platformAmount:grossAmount*p/100};
}
function canWithdraw(balanceTsh) { return Number(balanceTsh) >= config.minimumWithdrawalTsh; }
module.exports = {splitRevenue, canWithdraw};
