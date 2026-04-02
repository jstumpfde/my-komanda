module.exports = {
  apps: [{
    name: "my-komanda",
    script: "npm",
    args: "start",
    cwd: "/var/www/my-komanda",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      ANTHROPIC_API_KEY: "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",
    }
  }]
}
