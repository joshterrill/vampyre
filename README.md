# vampyre

<div align="center">
  <img src="./vampyre.webp" width="100" />
</div>

a javascript instrumentation script that hooks all variable evaluations and logs out its state. Primarily used for assisting with highly obfuscated javascript/node code.

_**Warning**: This will execute arbitrary code on the machine it runs on unless ran inside a Docker container. Beware._

# Usage

### Local (Node.js)

The following script produces `observations.jsonl` and `output.js`:

Optional args:

- `--output <output_path>` saves instrumented output file to specified path
- `--no-execute` saves instrumented output file but does not execute it
- `--report-console` logs eval state output to console after instrumentation output run
- `--loop-tail <count>` only records the last `<count>` observation entries generated inside each loop, preventing noisy long-running loops from spamming the log (a `__loop_truncated__` entry is emitted whenever earlier observations are dropped unless `--no-truncated-logs` is set)
- `--repeating-pattern <count>` limits each repeated `<name, value>` pair to `<count>` occurrences across the entire run; additional duplicates are suppressed and trigger a single `__repeat_truncated__` summary entry unless `--no-truncated-logs` is set
- `--no-truncated-logs` hides the `__loop_truncated__` and `__repeat_truncated__` summary entries when truncation flags are active

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
```

### Secure Docker Usage

To run instrument.js in a secure, isolated Docker container:

1. Build the Docker image:

  ```bash
  docker build -t vampyre-instrument .
  ```

2. Run the instrumenter on your sample, mounting your working directory:

  ```bash
  docker run --rm -v $(pwd):/workspace vampyre-instrument <sample.js> --output <output.js> [--no-execute] [--report-console]
  ```

  - Replace `<sample.js>` with your sample filename.
  - Output files (e.g., `output.js`, `observations.jsonl`) will be saved to your local directory.
  - You can pass any arguments supported by instrument.js.

**Example:**

```bash
docker run --rm -v $(pwd):/workspace vampyre-instrument examples/simple.js --report-console

```bash
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