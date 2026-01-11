# n8n Automation Workflows for IGetDressed

This document contains the n8n workflow templates for automated email sequences and conversion flows.

## Prerequisites

1. n8n instance connected at `igetdressed.app.n8n.cloud`
2. Email service (e.g., SendGrid, Mailchimp, Resend) configured in n8n
3. Environment variables set in Vercel:
   - `N8N_EVENTS_WEBHOOK_URL` - URL of your n8n webhook trigger
   - `N8N_WEBHOOK_SECRET` - Shared secret for n8n callbacks

## Webhook Endpoints

### Event Receiver (Frontend → n8n)
The frontend emits events to `/api/events/user` which forwards to n8n.

**Supported events:**
- `signup_complete` - User finished signup
- `trial_consumed` - User used their free trial
- `purchase_complete` - User purchased credits
- `outfit_generated` - User generated a try-on
- `pricing_viewed` - User viewed pricing page
- `checkout_started` - User started checkout
- `checkout_abandoned` - User abandoned checkout

### Callback Endpoint (n8n → Frontend)
n8n can call `/api/webhooks/n8n` to log email delivery status.

**Callback events:**
- `welcome_email_sent`
- `trial_reminder_sent`
- `conversion_email_sent`
- `abandoned_cart_reminder`
- `review_request_sent`

---

## Workflow 1: Welcome Sequence

**Trigger:** `signup_complete` event

### Workflow JSON (Import in n8n):

```json
{
  "name": "IGetDressed - Welcome Sequence",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "igetdressed-signup",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-trigger",
      "name": "Signup Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "resource": "message",
        "operation": "send",
        "to": "={{ $json.data.email }}",
        "subject": "Welcome to IGetDressed! Your free try-on is waiting 👗",
        "emailType": "html",
        "message": "<h1>Welcome to IGetDressed!</h1><p>Hi there!</p><p>Thanks for signing up. You have <strong>1 FREE try-on</strong> waiting for you.</p><p><a href='https://igetdressed.online' style='background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;'>Try On Now</a></p><p>See how you look in any outfit before you buy!</p><p>- The IGetDressed Team</p>"
      },
      "id": "send-welcome-email",
      "name": "Send Welcome Email",
      "type": "n8n-nodes-base.sendGrid",
      "typeVersion": 1,
      "position": [450, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://igetdressed.online/api/webhooks/n8n",
        "authentication": "predefinedCredentialType",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "Bearer {{ $env.N8N_WEBHOOK_SECRET }}"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "event", "value": "welcome_email_sent" },
            { "name": "userId", "value": "={{ $json.userId }}" },
            { "name": "email", "value": "={{ $json.data.email }}" }
          ]
        }
      },
      "id": "callback-webhook",
      "name": "Log Email Sent",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 3,
      "position": [650, 300]
    }
  ],
  "connections": {
    "Signup Webhook": {
      "main": [
        [{ "node": "Send Welcome Email", "type": "main", "index": 0 }]
      ]
    },
    "Send Welcome Email": {
      "main": [
        [{ "node": "Log Email Sent", "type": "main", "index": 0 }]
      ]
    }
  }
}
```

---

## Workflow 2: Trial Consumed → Conversion Email

**Trigger:** `trial_consumed` event
**Delay:** 1 hour after trial

### Workflow JSON:

```json
{
  "name": "IGetDressed - Post-Trial Conversion",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "igetdressed-trial-consumed",
        "responseMode": "responseNode"
      },
      "id": "webhook-trigger",
      "name": "Trial Consumed Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "amount": 1,
        "unit": "hours"
      },
      "id": "wait-1-hour",
      "name": "Wait 1 Hour",
      "type": "n8n-nodes-base.wait",
      "typeVersion": 1,
      "position": [450, 300]
    },
    {
      "parameters": {
        "resource": "message",
        "operation": "send",
        "to": "={{ $json.data.email }}",
        "subject": "Love your look? Get 20 more try-ons! ✨",
        "emailType": "html",
        "message": "<h1>How did your first try-on go?</h1><p>We hope you loved seeing yourself in that outfit!</p><p>Ready for more? Get <strong>20 try-ons for just $14.99</strong>:</p><ul><li>Try on unlimited styles</li><li>Shop with confidence</li><li>Never buy the wrong size again</li></ul><p><a href='https://igetdressed.online/pricing' style='background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;'>Get 20 Try-Ons →</a></p><p>Use code <strong>FIRSTLOOK</strong> for 10% off!</p>"
      },
      "id": "send-conversion-email",
      "name": "Send Conversion Email",
      "type": "n8n-nodes-base.sendGrid",
      "typeVersion": 1,
      "position": [650, 300]
    }
  ],
  "connections": {
    "Trial Consumed Webhook": {
      "main": [
        [{ "node": "Wait 1 Hour", "type": "main", "index": 0 }]
      ]
    },
    "Wait 1 Hour": {
      "main": [
        [{ "node": "Send Conversion Email", "type": "main", "index": 0 }]
      ]
    }
  }
}
```

---

## Workflow 3: Abandoned Cart Recovery

**Trigger:** `checkout_abandoned` event
**Delay:** 24 hours after abandonment

### Email Subject: "Still deciding? Here's 10% off your first purchase 💫"

### Workflow JSON:

```json
{
  "name": "IGetDressed - Abandoned Cart",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "igetdressed-checkout-abandoned",
        "responseMode": "responseNode"
      },
      "id": "webhook-trigger",
      "name": "Checkout Abandoned Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "amount": 24,
        "unit": "hours"
      },
      "id": "wait-24-hours",
      "name": "Wait 24 Hours",
      "type": "n8n-nodes-base.wait",
      "typeVersion": 1,
      "position": [450, 300]
    },
    {
      "parameters": {
        "resource": "message",
        "operation": "send",
        "to": "={{ $json.data.email }}",
        "subject": "Still deciding? Here's 10% off 💫",
        "emailType": "html",
        "message": "<h1>We noticed you didn't complete your purchase</h1><p>No worries! Fashion decisions are important.</p><p>Here's <strong>10% off</strong> to help you decide:</p><p>Use code: <strong>COMEBACK10</strong></p><p><a href='https://igetdressed.online/pricing?promo=COMEBACK10' style='background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;'>Complete Your Purchase →</a></p><p>This offer expires in 48 hours!</p>"
      },
      "id": "send-recovery-email",
      "name": "Send Recovery Email",
      "type": "n8n-nodes-base.sendGrid",
      "typeVersion": 1,
      "position": [650, 300]
    }
  ],
  "connections": {
    "Checkout Abandoned Webhook": {
      "main": [
        [{ "node": "Wait 24 Hours", "type": "main", "index": 0 }]
      ]
    },
    "Wait 24 Hours": {
      "main": [
        [{ "node": "Send Recovery Email", "type": "main", "index": 0 }]
      ]
    }
  }
}
```

---

## Workflow 4: Post-Purchase Review Request

**Trigger:** `purchase_complete` event
**Delay:** 3 days after purchase

### Email Subject: "How are you enjoying IGetDressed? ⭐"

---

## Setup Instructions

1. **Create n8n Workflows:**
   - Log into your n8n instance
   - Import each workflow JSON
   - Configure your email service credentials

2. **Set Environment Variables in Vercel:**
   ```
   N8N_EVENTS_WEBHOOK_URL=https://igetdressed.app.n8n.cloud/webhook/igetdressed-events
   N8N_WEBHOOK_SECRET=your-secret-here
   ```

3. **Test the Workflows:**
   - Sign up with a test account
   - Use a free trial
   - Verify emails are sent

4. **Monitor:**
   - Check n8n execution logs
   - Monitor email delivery rates
   - A/B test subject lines and content

---

## Promo Codes to Create

Create these discount codes in Stripe:
- `FIRSTLOOK` - 10% off first purchase (for trial users)
- `COMEBACK10` - 10% off (for abandoned cart)
- `BETA20` - 20% off (for beta launch promotion)

