# Learnt

## What "Bearer" means?
In HTTP the authorization follows the format: 
```Text
Authorization: <scheme> <credentials>
```
`Bearer` is one of the standard authorization scheme (others include `Basic`, `Direct` etc).

A typical header looks like:
```Text
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
```

## Why "Bearer"?
The term comes form the **Bearer Token** meaning whoever bears (holds) this token is authorised to use it so you are allowed to act as a token's owner.

## Transactions in PostgreSQL
In database terms, a transaction is a group of one or more operations that are treated as a single, atomic unit.
The standard flow looks like this:
- `BEGIN`: start the transaction
- Run the SQL queries 
- `COMMIT`: save the changes permanently
- Is there is any error `ROLLBACK`: undo the changes

---

# What I did
* **Parameterised queries (`$1`, `$2`):**  I understood that string concatenation (`"SELECT * WHERE id = " + id`) is a critical security vulnerability leading to SQL injection.
* **`BEGIN / COMMIT / ROLLBACK`:** I understood data integrity. I am ensuring the database never enters an inconsistent, partial state.
* **`client.release()` in a `finally` block:** I inderstood memory management. If a transaction fails and throws an error, the `finally` block guarantees the connection is returned to the pool, preventing memory leaks that would eventually crash the Node server.