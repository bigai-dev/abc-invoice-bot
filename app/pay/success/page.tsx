// Shown in the browser after a successful Stripe payment.
// The real confirmation (order + invoice PDF) arrives in the Telegram chat.
export default function PaySuccess() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-green-50 p-6">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-green-700 mb-3">Payment received!</h1>
        <p className="text-gray-600">
          You can close this window and return to <b>Telegram</b> — your invoice is on its way.
        </p>
      </div>
    </main>
  );
}
