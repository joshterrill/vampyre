# vampyre

<div align="center">
  <img src="./vampyre.webp" width="100" />
</div>

a javascript instrumentation script that hooks all variable evaluations and logs out its state. Primarily used for assisting with highly obfuscated javascript/node code.

_**Warning**: This will execute arbitrary code on the machine it runs on. Beware._

## Usage

The following script produces `observations.jsonl` and `output.js`:

Optional args:

- `--output <output_path>` saves instrumented output file to specified path
- `--no-execute` saves instrumented output file but does not execute it

- `--report-console` logs eval state output to console after instrumentation output run

```bash
node instrument.js examples/simple.js --report-console

# Wrote output.js
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