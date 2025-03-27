// const Razorpay = require("razorpay");
// const crypto = require("crypto");
// const dotenv = require("dotenv");
// dotenv.config();

// const razorpay = new Razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID,
//     key_secret: process.env.RAZORPAY_KEY_SECRET,
// });

// // ✅ Initiate Payment
// exports.initiatePayment = async (req, res) => {
//     const { amount, currency = "INR", receipt } = req.body;

//     try {
//         const options = {
//             amount: amount * 100, // Razorpay works in paisa
//             currency,
//             receipt,
//         };

//         const order = await razorpay.orders.create(options);
//         res.status(200).json(order);
//     } catch (error) {
//         console.error("Error initiating payment:", error);
//         res.status(500).json({ error: "Payment initiation failed" });
//     }
// };

// // ✅ Verify Payment
// exports.verifyPayment = async (req, res) => {
//     const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

//     const sign = razorpay_order_id + "|" + razorpay_payment_id;
//     const expectedSign = crypto
//         .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//         .update(sign)
//         .digest("hex");

//     if (expectedSign === razorpay_signature) {
//         res.status(200).json({ message: "Payment verified successfully" });
//     } else {
//         res.status(400).json({ error: "Invalid signature. Payment verification failed." });
//     }
// };
