// Unit tests never touch the network or a database; they only need a valid-looking alphabet.
process.env.SQIDS_ALPHABET ??= 'lkjhgfdsazxcvbnmpoiuytrewqLKJHGFDSAZXCVBNMPOIUYTREWQ9876543210';
process.env.BASE_URL ??= 'http://localhost:3000';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
