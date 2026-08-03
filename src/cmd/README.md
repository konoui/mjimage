## CLI

Generate tiles as SVG format from the command line.

スプライトをリポジトリ内のパス（`public/svg/tiles.svg`）から読むため、
このリポジトリの中でだけ動く（公開パッケージには含まれない）。

### Generate a Hand

```bash
npm run --silent cmd -- --input "123m123s123p111z2z, t2z" --outputFile hand.svg
```

```bash
npm run --silent cmd -- --input "123m123s123p111z2z, t2z"
```

### Generate a Table

```bash
npm run --silent cmd -- --inputFile ./src/lib/__tests__/__fixtures__/table.common.yaml --outputFile table.svg
```
