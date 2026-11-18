// Shown in the browser when the customer backs out of the Stripe payment page.
export default function PayCancelled() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md text-center">
        <div className="text-6xl mb-4">🛒</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-3">No charge was made</h1>
        <p className="text-gray-600">
          Return to <b>Telegram</b> and tap <b>Checkout</b> again whenever you&apos;re ready.
        </p>
      </div>
    </main>
  );
}
