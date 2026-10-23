# Google Play release checklist

Do not publish to production without the owner's explicit approval.

- [ ] Play Console developer account created (personal accounts created after Nov 2023 must run a closed test with at least 12 testers for 14 days before applying for production; verify current rules in Play Console).
- [ ] Upload keystore generated and **backed up offline** (losing it blocks updates). Enrol in Play App Signing.
- [ ] Backend deployed in production mode, database backups verified, admin owner account created, default password removed from env.
- [ ] Real OTP provider working on a real phone. Payment path tested end to end with a real ₹99 payment and refund.
- [ ] Support plan wording reviewed (what "Limited" and "Lifetime" mean, response time, refund policy) in Admin > Plans / Settings.
- [ ] Privacy policy URL: `https://<backend>/privacy`. Terms: `https://<backend>/terms`. Account deletion URL/process documented in the listing (in-app: Account > Delete my account).
- [ ] Data safety form: collected = name, phone number, approximate location text and PIN code, profile photo (optional), purchase history; encrypted in transit; users can request deletion; not sold; no ads.
- [ ] Content rating questionnaire, target audience (18+ recommended because it involves payments), app category (Education).
- [ ] Store listing: icon 512×512, feature graphic 1024×500, at least 2 phone screenshots, short and full description, contact email.
- [ ] Pre-launch report from Play Console reviewed; crash-free internal test for a week.
- [ ] Tag `vX.Y.Z` -> Codemagic AAB -> upload to Internal testing -> Closed testing -> (owner approval) Production.
