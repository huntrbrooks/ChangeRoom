# Influencer Outreach Guide for IGetDressed Beta Launch

This document contains templates and strategies for influencer partnerships.

## Target Influencers

### Ideal Profile
- **Followers:** 10K - 50K (micro-influencers have better engagement)
- **Niche:** Fashion, Style, Shopping, Beauty
- **Platform:** Instagram, TikTok
- **Engagement Rate:** >3%
- **Audience:** Fashion-conscious, 18-35 age range

### Where to Find Them
1. **Instagram Search:**
   - Hashtags: #ootd, #fashionblogger, #styleinspo, #outfitoftheday
   - Location: Australia, UK, US fashion hubs

2. **TikTok:**
   - Fashion hashtags: #fashiontok, #outfitideas, #getreadywithme

3. **Platforms:**
   - Collabstr (collabstr.com)
   - Upfluence
   - AspireIQ

---

## Outreach Templates

### Template 1: Cold DM (Instagram)

```
Hey [NAME]! 👋

I've been following your fashion content and love your style - especially that [RECENT POST REFERENCE]!

I'm launching IGetDressed.online, a virtual try-on app that lets you see how clothes look on YOU before buying. Think of it like a personal fitting room in your pocket! 👗✨

I'd love to gift you 50 free try-ons ($44 value) to try it out. If you like it, would you be open to sharing one look with your audience?

No pressure at all - just thought it might be something your followers would love!

Check it out: igetdressed.online

- Gerard
IGetDressed Team
```

### Template 2: Email Outreach

```
Subject: Collab Opportunity - Virtual Fashion Tech 👗

Hi [NAME],

I'm Gerard from IGetDressed - we've built an AI-powered virtual try-on app that lets people see how clothes look on them before buying. Think Snapchat filters, but for fashion!

**Why I'm reaching out:**
Your fashion content resonates with exactly the audience who would love this tool. I'd love to partner with you for our beta launch.

**What I'm offering:**
- 50 free try-ons (worth $44)
- Featured on our Instagram
- Optional: $[50-100] paid promotion

**What I'm hoping for:**
- One Instagram Story or Reel showing you trying on an outfit
- Honest reaction (we only want authentic content!)

**Quick demo:** igetdressed.online (takes 30 seconds to try)

Would you be interested? Happy to jump on a quick call or just send you the free credits to play around with first.

Best,
Gerard
Founder, IGetDressed
---
P.S. We're launching in 5 days and looking for 5-10 creators to be part of our launch squad!
```

### Template 3: Follow-Up (3 Days Later)

```
Hey [NAME]!

Just wanted to follow up on my message about IGetDressed. Totally understand if you're busy or not interested!

Quick recap: We're a virtual try-on app launching soon, and I'd love to gift you 50 free try-ons to try it out.

If you're interested, just let me know and I'll set up your account instantly. No strings attached!

Cheers,
Gerard
```

### Template 4: After They Accept

```
Awesome, thanks so much [NAME]! 🎉

I've just gifted 50 credits to your account at: [EMAIL]

Here's how to get started:
1. Go to igetdressed.online
2. Sign in with [EMAIL]
3. Upload a photo of yourself
4. Paste any product URL or upload a clothing image
5. Hit "Try It On" and see the magic! ✨

**Tips for great results:**
- Use well-lit photos of yourself
- Works best with clear product images
- Try mixing different items for a full outfit

If you do decide to share, here's a few hashtags: #IGetDressed #VirtualTryOn #FashionTech

Tag us @igetdressed.online and we'll reshare! 💜

Let me know if you have any questions. Excited to see what looks you create!

- Gerard
```

---

## Gifting Credits to Influencers

### Via API (for developers/admins)

```bash
curl -X POST https://igetdressed.online/api/admin/gift-credits \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -d '{
    "email": "influencer@email.com",
    "credits": 50,
    "reason": "Influencer collab - Instagram 25K followers"
  }'
```

### Response:
```json
{
  "success": true,
  "email": "influencer@email.com",
  "creditsGifted": 50,
  "totalCredits": 50,
  "reason": "Influencer collab - Instagram 25K followers"
}
```

### Via Admin Panel (coming soon)
- Navigate to /admin/gift-credits
- Enter influencer email
- Set number of credits (default: 50)
- Add tracking note
- Click "Gift Credits"

---

## Tracking & Follow-Up

### Spreadsheet Columns
| Name | Handle | Followers | Email | Status | Credits Gifted | Post Link | Conversion |
|------|--------|-----------|-------|--------|----------------|-----------|------------|
| | | | | Contacted/Responded/Declined/Posted | | | |

### Key Metrics to Track
1. **Response Rate:** % of influencers who respond
2. **Acceptance Rate:** % who accept the offer
3. **Post Rate:** % who actually post
4. **Reach:** Total impressions from posts
5. **Conversions:** Sign-ups with promo code or referral link

---

## Promo Codes to Create

### In Stripe:
- `BETA50` - 50% off first purchase (for beta launch)
- `CREATOR20` - 20% off (for influencer followers)
- `[INFLUENCERNAME]` - Custom codes per influencer for tracking

### Referral Tracking:
Add `?ref=[influencer_handle]` to URLs they share for attribution:
`https://igetdressed.online/?ref=fashionista_jane`

---

## Launch Day Strategy

### Day Before
- [ ] Send reminder DMs to confirmed influencers
- [ ] Prepare reshare graphics
- [ ] Test all influencer accounts have credits

### Launch Day
- [ ] Post launch announcement on all channels
- [ ] Monitor for influencer posts
- [ ] Reshare all influencer content immediately
- [ ] Thank influencers publicly

### Day After
- [ ] Send thank you messages
- [ ] Share performance metrics with influencers who posted
- [ ] Ask for testimonials/quotes

---

## Content Suggestions for Influencers

### Video Ideas (TikTok/Reels)
1. "Testing this virtual try-on app..." + genuine reaction
2. "POV: You can try on clothes without going to the store"
3. "Is this AI fashion thing actually good?" (honest review)
4. "Get Ready With Me using IGetDressed"

### Story Ideas
1. Screen recording of trying on an outfit
2. Before/after comparison
3. Poll: "Would you use this?"
4. "Link in bio" with swipe-up

---

## Budget Allocation (with $200-300)

| Item | Cost | Notes |
|------|------|-------|
| Micro-influencer 1 | $50-100 | 15K+ followers |
| Micro-influencer 2 | $50-100 | 15K+ followers |
| Micro-influencer 3 | $50-100 | 15K+ followers |
| Free credits gifts | $0 | 5x influencers × 50 credits = 250 credits |

**Note:** Gifted credits cost us nothing until used (API costs), so be generous with credits!

