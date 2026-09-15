module.exports = {
  apps: [
    {
      name: 'validador-od',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '400M',
      time: true,
    },
  ],
};
