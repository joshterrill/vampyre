# Tattletail

a javascript instrumentation script that logs out all evaluated variables and functions

## Usage

The following script produces `observations.jsonl` and `instrumented.js`:

```bash
REPORT_CONSOLE=1 node instrument.js examples/simple.js
# Wrote instrumented.js
# [__report] {
#   ts: 1760493315667,
#   name: 'people',
#   value: [
#     { name: 'Alice', age: 30 },
#     { name: 'Bob', age: 25 },
#     { name: 'Charlie', age: 35 }
#   ]
# }
# [__report] {
#   ts: 1760493315667,
#   name: 'names',
#   value: [ 'Alice', 'Bob', 'Charlie' ]
# }
# Names:
# [ 'Alice', 'Bob', 'Charlie' ]
# [__report] {
#   ts: 1760493315667,
#   name: 'olderPerson',
#   value: { name: 'Alice', age: 35 }
# }
# Alice will be 35 in 5 years.
# [__report] {
#   ts: 1760493315668,
#   name: 'olderPerson',
#   value: { name: 'Bob', age: 30 }
# }
# Bob will be 30 in 5 years.
# [__report] {
#   ts: 1760493315668,
#   name: 'olderPerson',
#   value: { name: 'Charlie', age: 40 }
# }
# Charlie will be 40 in 5 years.
# Observations appended to observations.jsonl
```

From `observations.jsonl`:

```json
{"ts":1760493413778,"name":"people","value":[{"name":"Alice","age":30},{"name":"Bob","age":25},{"name":"Charlie","age":35}]}
{"ts":1760493413778,"name":"names","value":["Alice","Bob","Charlie"]}
{"ts":1760493413778,"name":"olderPerson","value":{"name":"Alice","age":35}}
{"ts":1760493413778,"name":"olderPerson","value":{"name":"Bob","age":30}}
{"ts":1760493413778,"name":"olderPerson","value":{"name":"Charlie","age":40}}
```

## License

MIT