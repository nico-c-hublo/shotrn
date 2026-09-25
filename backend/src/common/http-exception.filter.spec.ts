import { DrizzleQueryError } from 'drizzle-orm';
import { describeFailure } from './http-exception.filter';

describe('describeFailure', () => {
  // A constraint violation from Postgres: the message names the constraint, and the row
  // values (here a code and its destination) sit in `detail`.
  function checkViolation(): Error {
    return Object.assign(new Error('new row for relation "links" violates check constraint'), {
      code: '23514',
      detail: 'Failing row contains (Secret0Code13, https://private.example/doc).',
    });
  }

  it('describes a failed query by its SQL and database error, never its parameters', () => {
    const error = new DrizzleQueryError(
      'insert into "links" ("code", "original_url") values ($1, $2)',
      ['Secret0Code13', 'https://private.example/doc'],
      checkViolation(),
    );

    const described = describeFailure(error);

    expect(described).toContain('insert into "links"');
    expect(described).toContain('23514');
    expect(described).not.toContain('Secret0Code13');
    expect(described).not.toContain('private.example');
  });

  it('keeps the stack of any other error for diagnosis', () => {
    expect(describeFailure(new Error('pool exhausted'))).toMatch(/^Error: pool exhausted\n\s+at /);
  });
});
