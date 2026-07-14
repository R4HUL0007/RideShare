# RideShare Razorpay Setup Guide

## Why You Need a Separate Account

Your current Razorpay keys (`rzp_test_Sw4gbGUbzffCJK`) are linked to your **portfolio business**. You **cannot delete or change** these keys to point to RideShare — they're permanently associated with your portfolio account.

Instead, you need to create a **brand new Razorpay account** specifically for RideShare with its own keys.

---

## Step-by-Step Setup

### 1. **Log Out of Current Razorpay Account**
   - Go to [https://dashboard.razorpay.com](https://dashboard.razorpay.com)
   - Click your profile icon (top right)
   - Click **Log Out**

### 2. **Create New RideShare Account**
   - Go to [https://dashboard.razorpay.com/signup](https://dashboard.razorpay.com/signup)
   - Use a **different email** (NOT the one used for portfolio)
     - Recommended: `hello@ridexshare.online` or `rmdm283+rideshare@gmail.com`
   - Fill in the business details:
     - **Business Name**: RideShare or RidexShare
     - **Website**: `https://ridexshare.online`
     - **Business Type**: Choose appropriate category (likely "Transportation" or "Technology")

### 3. **Get Your Test Keys**
   After signing up:
   - You'll land on the Razorpay Dashboard
   - Make sure you're in **TEST MODE** (toggle at top left should say "Test Mode")
   - Go to: **Settings → API Keys** (in left sidebar)
   - Click **Generate Test Keys** (if not already generated)
   - You'll see:
     ```
     Key ID: rzp_test_XXXXXXXXXXXXXX
     Key Secret: [Click "Show" to reveal]
     ```
   - **Copy both** — you'll need them in the next step

### 4. **Update Your Environment Files**

#### A. Local Development (`backend/.env`)
```env
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=YOUR_NEW_SECRET_HERE
```

#### B. Production Files
Update **THREE** locations with the new keys:

1. **`.env.production`** (line 56-57):
```env
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=YOUR_NEW_SECRET_HERE
```

2. **`tools/northflank-runtime.env`** (line 16-17):
```env
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=YOUR_NEW_SECRET_HERE
```

3. **Frontend key in `.env.production`** (line 91):
```env
VITE_RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXX
```

### 5. **Deploy to Northflank**
   - Go to your Northflank dashboard
   - Navigate to your backend service
   - Go to **Environment Variables**
   - Update these two variables:
     ```
     RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXX
     RAZORPAY_KEY_SECRET=YOUR_NEW_SECRET_HERE
     ```
   - Click **Save Changes**
   - The service will automatically redeploy

### 6. **Deploy to Cloudflare Pages**
   - Go to Cloudflare Pages dashboard
   - Select your RideShare project
   - Go to **Settings → Environment Variables**
   - Update:
     ```
     VITE_RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXX
     ```
   - Click **Save**
   - Trigger a new deployment

---

## Important Notes

### About Test Mode
- **Test keys are INSTANT** — no verification needed
- You can test payments immediately with demo card numbers
- Test transactions appear in your dashboard but **no real money** moves
- Perfect for development and testing

### Test Card for Demo Payments
When testing, use these card details:
```
Card Number: 4111 1111 1111 1111
CVV: Any 3 digits (e.g., 123)
Expiry: Any future date (e.g., 12/25)
```

### When You Need Live (Real) Payments
If you ever want to accept **real payments**:
1. Go to Razorpay Dashboard → **Switch to Live Mode** (toggle top left)
2. Complete **KYC verification**:
   - PAN card
   - Bank account details
   - Business documents
   - This takes 1-2 business days for approval
3. After approval, generate **Live keys** (they'll look like `rzp_live_XXXXX`)
4. Replace the `rzp_test_*` keys with the new live keys in all env files

---

## Your Portfolio Account Stays Untouched

- Your existing portfolio Razorpay account **remains unchanged**
- It still uses its original keys: `rzp_test_Sw4gbGUbzffCJK`
- You now have **two separate accounts**:
  - Portfolio account (old keys) → handles portfolio payments
  - RideShare account (new keys) → handles RideShare payments

This is the **correct way** to separate business accounts on Razorpay.

---

## What Happens After You Update Keys?

Once you update the keys in all locations:
- **RideShare payments** will be processed through your **new RideShare account**
- All transactions will appear in the **RideShare Razorpay dashboard**
- Payment receipts, webhooks, and settlements will be tied to the RideShare business
- Your portfolio payments continue unchanged on the old account

---

## Checklist

- [ ] Logged out of current Razorpay account
- [ ] Created new Razorpay account with different email
- [ ] Business name set to RideShare/RidexShare
- [ ] Website set to https://ridexshare.online
- [ ] Generated Test Mode API keys
- [ ] Copied Key ID and Key Secret
- [ ] Updated `backend/.env` (local)
- [ ] Updated `.env.production`
- [ ] Updated `tools/northflank-runtime.env`
- [ ] Updated `VITE_RAZORPAY_KEY_ID` in `.env.production`
- [ ] Updated Northflank environment variables
- [ ] Updated Cloudflare Pages environment variables
- [ ] Tested a payment with test card (4111 1111 1111 1111)

---

## Need Help?

If you have any issues:
1. Make sure you're in **Test Mode** in the Razorpay dashboard
2. Verify the keys are correctly copied (no extra spaces)
3. Check that the service redeployed after updating env vars
4. Test locally first before deploying to production

