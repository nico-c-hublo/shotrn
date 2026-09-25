// Unit tests never touch the network or a database; they only need valid-looking values.
process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
