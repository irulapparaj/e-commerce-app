const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const SCRIPT_ID = 'razorpay-checkout';

let loadPromise: Promise<void> | null = null;

export const loadRazorpayScript = (): Promise<void> => {
  if (loadPromise !== null) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID) !== null) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Razorpay Checkout.js failed to load'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
};

export interface RazorpayCheckoutOptions {
  readonly keyId: string;
  readonly amountPaise: number;
  readonly razorpayOrderId: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly accentColor: string;
  readonly onSuccess: (paymentId: string, razorpayOrderId: string, signature: string) => void;
  readonly onDismiss: () => void;
}

interface RazorpayInstance {
  open(): void;
  close(): void;
}

interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay: RazorpayConstructor;
  }
}

export const openRazorpayCheckout = (opts: RazorpayCheckoutOptions): RazorpayInstance => {
  const rzp = new window.Razorpay({
    key: opts.keyId,
    amount: opts.amountPaise,
    currency: 'INR',
    order_id: opts.razorpayOrderId,
    name: opts.name,
    prefill: { email: opts.email, contact: opts.phone },
    theme: { color: opts.accentColor },
    handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
      opts.onSuccess(response.razorpay_payment_id, response.razorpay_order_id, response.razorpay_signature);
    },
    modal: { ondismiss: opts.onDismiss },
  });
  rzp.open();
  return rzp;
};
