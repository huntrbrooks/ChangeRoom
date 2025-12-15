# Accept a Payment with Elements and the Checkout Sessions API

> Note: This folder is a standalone Stripe sample for local experimentation only. It is not part of the Next.js app, is not used in CI, and should not be deployed with the main application. Keep it separate from production builds.

## Set Price ID

In the back end code, replace `{{PRICE_ID}}` with a Price ID (`price_xxx`) that you created.

## Running the sample

1. Build the server

~~~
npm install
~~~

2. Run the server

~~~
npm start
~~~

3. Go to [http://localhost:4242/checkout.html](http://localhost:4242/checkout.html)