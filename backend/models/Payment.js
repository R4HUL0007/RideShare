// const mongoose = require("mongoose");

// const PaymentSchema = new mongoose.Schema({
//     user_id: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "User",
//         required: true
//     },
//     order_id: {
//         type: String,
//         required: true
//     },
//     payment_id: {
//         type: String
//     },
//     amount: {
//         type: Number,
//         required: true
//     },
//     currency: {
//         type: String,
//         required: true
//     },
//     status: {
//         type: String,
//         enum: ["Pending", "Completed", "Failed"],
//         default: "Pending"
//     },
//     createdAt: {
//         type: Date,
//         default: Date.now
//     }
// }, { timestamps: true });

// module.exports = mongoose.model("Payment", PaymentSchema);
