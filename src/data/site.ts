// Everything personal lives here. Edit these values and the whole site updates.

export const site = {
  name: "Alember Shreesh",
  shortName: "Alember",
  handle: "GosuCode",
  initials: "AS",
  role: "Backend developer · BCA, Tribhuvan University",
  location: "Nepal",
  tagline: "Notes, papers, and things I build.",

  bio: [
    "I'm Alember — a backend-leaning developer from Nepal. I did my BCA (Bachelor in Computer Applications) under Tribhuvan University, where most of what I know came from building things and then fixing what broke.",
    "I like the backend side: APIs, databases, caching, deployment pipelines, and the decisions that decide whether a system holds up under load. Node.js, TypeScript, PostgreSQL, Redis and Docker are home ground; I keep poking at AWS, CI/CD and API gateways.",
    "This vault is my corner of the internet — the past papers and project documents I wished were easier to find during my degree, write-ups for the things I build, and notes on the problems I run into.",
  ],

  socials: [
    { label: "GitHub", href: "https://github.com/GosuCode" },
    { label: "Medium", href: "https://medium.com/@gosucode" },
    { label: "Email", href: "mailto:gosucode1945@gmail.com" },
  ],

  // What I actually reach for, grouped by layer.
  skills: [
    {
      label: "Backend",
      items: ["Node.js", "TypeScript", "Fastify", "Express", "NestJS", "REST APIs", "JWT auth"],
    },
    {
      label: "Data",
      items: ["PostgreSQL", "MongoDB", "Redis", "Prisma", "Drizzle"],
    },
    {
      label: "Infra & delivery",
      items: ["Docker", "AWS (EC2, S3)", "CI/CD", "KrakenD", "Vercel", "Cloudflare"],
    },
    {
      label: "Frontend",
      items: ["React", "Next.js", "Tailwind CSS", "Flutter"],
    },
  ],

  // What you're up to right now — shows on the homepage card and About page.
  now: [
    "Building this archive and its search",
    "Writing about Node.js, Docker and Redis",
  ],

  // Drop a square photo at public/avatar.jpg and set this to "/avatar.jpg".
  // Until then, a hand-drawn monogram is shown.
  avatar: null as string | null,
};
