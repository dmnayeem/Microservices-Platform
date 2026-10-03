/**
 * The help-center questions. Shared by the page (the accordion) and its
 * layout (the FAQPage structured data that lets search and AI answers quote
 * them) — one list, so the two can never disagree.
 *
 * Every answer has to be true of the platform as built. Amounts that an admin
 * can change (minimums, fees, processing time, whether a plan is needed to
 * withdraw) are described, not quoted, and the answer says where the live
 * value is shown.
 */
export const HELP_CATEGORIES: Array<{ title: string; articles: Array<{ q: string; a: string }> }> = [
  {
    title: "About RevType",
    articles: [
      { q: "What is RevType?", a: "RevType is a freelance micro-task marketplace and digital skill-sharing community. Members complete short paid tasks posted by businesses and advertisers, sell digital products and freelance services in the marketplace, take or teach online courses, and earn affiliate commissions on sales they refer." },
      { q: "Is RevType a PTC (paid-to-click) site?", a: "No. RevType is a micro-task, marketplace and courses platform: pay comes from completed and verified work, from products and services you sell, and from courses you teach. Like many free platforms, RevType does display ads, and some tasks and activities (such as time-based sponsored browsing, video tasks and partner offers) are sponsored by advertisers. Earnings are never guaranteed." },
      { q: "Is RevType legit, and how does it make money?", a: "RevType is funded by real revenue: advertising, businesses that pay up front for the tasks and campaigns they create, a platform fee on marketplace sales, optional paid membership plans, and a withdrawal fee. Members are paid out of that revenue for work that has been checked. Rules, task pay and fees are shown before you act, and the Terms of Service, Privacy Policy and Refund Policy are published on the site." },
      { q: "Do I have to pay to join or withdraw?", a: "Joining is free and needs no credit card, and you can complete tasks on the free plan. Withdrawing can require an active paid plan: this is a platform setting, and while it is switched on, members on the free plan must buy a plan before they can request a payout. The withdrawal screen tells you whether this applies to you, along with the minimum amount and the withdrawal fee, before you confirm anything." },
      { q: "How much can I earn?", a: "There is no fixed or guaranteed amount. Each task shows its pay before you start, and income depends on which tasks are available in your country, whether your work is approved, and what you sell or teach. Treat it as flexible side income, not a salary." },
    ],
  },
  {
    title: "Getting started",
    articles: [
      { q: "How do I create an account?", a: "Tap Sign Up and register with your email address or your Google account, then verify your email. Creating an account is free and takes about a minute. You must be 18 or older." },
      { q: "How do I earn?", a: "Complete freelance micro-tasks posted by businesses and advertisers, sell digital products or services in the marketplace, teach a course, or earn affiliate and referral commissions. Some activities, such as partner offers and time-based sponsored browsing, are sponsored. See the Micro Tasks page for every task type." },
      { q: "Which countries is it available in?", a: "RevType is open to members internationally. Some tasks are targeted to specific countries or regions, and payout methods and some features vary by country, so you only see what you are eligible for." },
    ],
  },
  {
    title: "Earning & tasks",
    articles: [
      { q: "What kinds of tasks are there?", a: "Social actions (follow, like, comment, review, post), video tasks, article reading, surveys, quizzes, app installs, offerwall offers and custom tasks written by the buyer. Each task shows what it pays, what proof it needs and how long you have before you start." },
      { q: "How are tasks verified?", a: "It depends on the task. Submitted links can be checked automatically against the buyer's rules; video and article time is measured on the server, not self-reported; offerwall completions are confirmed by the partner's server; quiz answers are checked on the server; and screenshot proof is reviewed by a person. When a link cannot be read automatically, the task goes to a human reviewer instead of being rejected. Approved work is credited once." },
      { q: "How long does approval take?", a: "Tasks with automatic checks can approve within seconds. Tasks that need manual review wait for a reviewer, which usually takes from a few hours to a couple of days." },
      { q: "Why was my submission rejected?", a: "Usually invalid or incomplete proof, a duplicate, or a fraud flag. You get a note explaining the reason so you can fix it next time. Rejected work is not paid." },
      { q: "How do referrals work?", a: "Every account has a personal referral link. Referral rewards are tied to the genuine activity of the people you invite, are capped, and never reduce what they earn. The live rates and which rewards are active are shown on your referrals screen." },
    ],
  },
  {
    title: "Marketplace, services & courses",
    articles: [
      { q: "What can I sell?", a: "Digital products such as templates, graphics, stock photos and video, music and audio, ebooks and guides, and software or digital tools, plus freelance services. Selling requires an approved seller application, and every listing is reviewed before it goes live. Physical goods are not sold on RevType." },
      { q: "Can I offer services like on Fiverr?", a: "Yes. You can create a service listing that states what you deliver, the turnaround time and the number of revisions included. Custom work and negotiated deals run through escrow: the buyer's payment is held until delivery is confirmed, with built-in chat and admin mediation if there is a dispute. A platform fee is taken from each sale." },
      { q: "Can I teach a course?", a: "Yes. Apply to become a tutor; once approved you can build a course with video lessons, resources and quizzes, set your price, and schedule live classes. You earn from each enrolment, and affiliates can promote your course for a commission." },
    ],
  },
  {
    title: "Withdrawals & payments",
    articles: [
      { q: "How do I withdraw my earnings?", a: "Tasks pay points. Convert points to cash in your wallet, then request a withdrawal from your cash balance to one of the enabled payout methods. The minimum, the fee and any plan requirement are shown before you confirm." },
      { q: "What payout methods are supported?", a: "PayPal, crypto via Binance or Bitget, and mobile wallets such as bKash, Nagad and Rocket. Which methods are switched on can change and can vary by country; the withdrawal screen lists what is available to you." },
      { q: "How are payouts made and how long do they take?", a: "Every withdrawal request is reviewed by the team and then sent to the method you chose. The current processing estimate is shown on the withdrawal screen and can be several business days, or up to a couple of weeks at busy times." },
      { q: "Why do you verify some withdrawals?", a: "To keep fraud out so genuine members get paid. Identity verification (KYC) is required for larger withdrawals and can be required for all of them, and one verified identity can only belong to one account. Completing verification early avoids delays." },
    ],
  },
  {
    title: "Rules & safety",
    articles: [
      { q: "What's not allowed?", a: "Bots or automation, multiple or fake accounts, VPN or proxy fraud, fake or reused proof, exploiting bugs, scraping, and interfering with security or other members. Breaking these rules gets submissions rejected, can cost you points or balance, and can get an account closed. The full list is in the Terms of Service." },
      { q: "How do I report abuse or copyright infringement?", a: "Use the Report Abuse page to report fraud, scams, harmful content or a copyright problem. Reports are reviewed by the team." },
    ],
  },
  {
    title: "Account & security",
    articles: [
      { q: "How do I keep my account secure?", a: "Use a unique, strong password and turn on two-factor authentication. RevType staff will never ask for your password or one-time codes." },
      { q: "I can't log in — what do I do?", a: "Reset your password from the login page. If you're still stuck, contact support and we'll help you recover access." },
      { q: "How is my data protected?", a: "Connections are encrypted over HTTPS, and the Privacy Policy explains what we collect, why, and the choices you have. We do not sell your personal data." },
      { q: "How do I delete my account?", a: "You can request deletion from your account settings. It's permanent, so withdraw any balance you are eligible to withdraw first." },
    ],
  },
];
