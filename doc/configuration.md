## HUGO

### 設定

- コードブロックで `mjimage` を指定した場合に展開する設定

```bash
$ cat layouts/_default/_markup/render-codeblock-mjimage.html
```

```html
<div class="mjimage">{{- .Inner | safeHTML }}</div>
{{ .Page.Store.Set "hasMjimage" true }}
```

- ショートコードで `{{< use-mjimage >}}` と宣言し展開する設定
  - `1s` などのインラインコードを使用する場合を想定

```bash
$ cat layouts/shortcodes/use-mjimage.html
```

```html
<span hidden class="mjimage"></span>
```

- ショートコードもしくは `mjimage` のコードブロックが使用されている場合、変換用の javascript を読み込む
  - インラインコードのための `code` タグと、コードブロックの `mjimage` クラスを変換対象とする想定

```bash
$ cat layouts/_default/baseof.html
```

```html
<!DOCTYPE html>
<html lang="{{ .Site.LanguageCode | default "en" }}">
    {{ partial "head.html" . }}
    <body>
        {{ partial "header.html" . }}
        {{ partial "darkmode.html" . }}
        {{ block "main" . }}{{ end }}
        {{ partial "footer.html" . }}

        {{ if or (.HasShortcode "use-mjimage") (.Page.Store.Get "hasMjimage") }}
        <script src="https://static.konoui.dev/mjimage/global.js"></script>
        <script>
          window.onload = function () {
            mjimage.initialize({
              imageHostUrl: "https://static.konoui.dev/mjimage/svg/",
              querySelector: ["code", ".mjimage"],
              scale: 2,
              tableScale: 3
            });
          };
        </script>
        {{- end }}
    </body>
</html>
```
