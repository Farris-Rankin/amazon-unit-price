# Amazon Standard Unit Price

Tampermonkey userscript for Amazon.com search results. It adds unit-price choices to Amazon's existing **Sort by** menu and sorts comparable products by the selected unit, defaulting to **dollars per pound**.

When a title has a clear weight, the script divides the current package price by that weight. This works whether Amazon prints a price per ounce, per pound, per count, or no unit price. Clear multipacks use the combined weight. For example, **$40 for “10 lb (Pack of 2)” = $2/lb**.

## Install in Brave

1. Install [Tampermonkey from its official website](https://www.tampermonkey.net/) if needed. Brave supports Chrome Web Store extensions.
2. Open [Amazon Standard Unit Price on Greasy Fork](https://greasyfork.org/en/scripts/598866-amazon-standard-unit-price) and select **Install this script**.
3. Confirm installation in Tampermonkey. Updates are available through Tampermonkey's normal update checks.
4. Reload the [bird-seed search](https://www.amazon.com/s?k=black%20oil%20sunflower%20seeds&i=lawngarden).

For manual installation, open [amazon-unit-price-1.3.3.user.js](amazon-unit-price-1.3.3.user.js), copy the complete file into Tampermonkey's **Create a new script** editor, and save with **Ctrl+S**. Version **1.3.3** fixes sheet counts in titles and Amazon's per-sheet labels. It preserves the Amazon-menu integration, length support and MIT license.

If Tampermonkey reports that userscripts are disabled, open `brave://extensions`, open Tampermonkey's details, and enable **Allow User Scripts** if shown. Tampermonkey documents Developer Mode as an alternative for browsers without that toggle.

The script starts sorting automatically. Open Amazon's **Sort by** menu and choose a unit under **Unit price**. Selecting a unit enables local unit-price sorting. Selecting an original Amazon option disables it and uses Amazon's original choice or destination. Your unit and on/off settings are remembered. The same units are also available in Tampermonkey's script menu.

For page variants without Amazon's sort menu, the supplied integration keeps a small dark unit dropdown and **⇅** restore toggle at the bottom right as a fallback.

| Comparison | Available units |
| --- | --- |
| Weight | oz, lb, g, 100 g, kg |
| Count | count |
| Liquid volume | US fl oz, mL, 100 mL, L, US pint, US quart, US gallon |
| Length | in, ft, yd, mm, cm, m |

Weight units share the same ranking. Liquid volume units share their own ranking. Selecting **Count** recalculates from an explicit item or pack count in the title, including clear multipacks, or from Amazon's displayed count rate. For example, $24 for “24 count (Pack of 2)” becomes $0.50/count. Missing counts stay unranked; package weight is not used to invent a count. Count follows the stated item or pack, so compare similar products and package types.

Sheet quantities such as “100 Sheets,” “100-sheet pack” and “100 sheets (Pack of 2)” are recognized. The reported transparency-film listings at $13.80 and $14.02 for 100 sheets display $0.138/count and $0.140/count. Amazon's “$13.80/100 Sheets” label can also supply the count rate when the title has no quantity. Printer sheet capacity and sheets per pass are excluded from package count.

Liquid comparisons use the title's volume or a displayed volume rate. For example, $10 for “500 mL” becomes $20/L. US customary liquid units are used on Amazon.com. The script does not infer liquid volume from weight or weight from volume.

Length comparisons use the total package length. For example, $30 for “50 ft (Pack of 2)” becomes $0.30/ft or $0.90/yd. Feet, yards, inches and metric lengths share the same ranking. It recognizes feet-and-inches notation, equivalent labels such as “100 ft (30.48 m),” and clear roll/spool/reel multipacks. When the title lacks length, a compatible Amazon length rate is converted instead.

For rolls, tape, straps and other linear materials, a clear long-and-narrow dimension pair can identify length in either order. For example, “VELCRO Brand Cut-to-Length Straps Roll, 30ft x 1/2in, Black” at $8.80 uses 30 ft and produces $0.293/ft or $0.880/yd. Spaced, compact and multiplication-sign formats are recognized. The inference requires one connected dimension tuple whose longest axis is at least ten times the other axes; hover over the badge to see when this rule is used. Equivalent length labels and multipack totals are still checked for conflicts.

Widths, diameters, area and ambiguous shapes are excluded from package length. For example, “2 in wide x 25 yd long” uses 25 yd, while a roll described only as “1 m x 2 m” stays unranked. A bare “2 x 50 ft” needs a pack or roll description, or an explicit total, to establish that it means two lengths. Length is not converted into weight, volume or count.

## What the comparison means

| Listing | Calculation at a $40 package price |
| --- | --- |
| “20 lb,” price per pound | $40 ÷ 20 lb = $2/lb |
| “320 oz,” price per ounce | $40 ÷ (320 ÷ 16) lb = $2/lb |
| “10 lb (Pack of 2),” price per count | $40 ÷ (10 × 2) lb = $2/lb |
| “2 × 10 lb,” no unit price | $40 ÷ 20 lb = $2/lb |

It recognizes weight, volume, count and length quantities, fractions, equivalent unit labels and clear pack counts. A clear title calculation takes priority over a rounded or incorrect Amazon unit label. If the title lacks the selected quantity but Amazon supplies one compatible unit rate, the script converts that rate.

Missing or conflicting quantities show **Weight?**, **Volume?**, **Count?** or **Length?**, depending on the selected unit, and sort after comparable products. Hover over a badge to see its calculation or reason. A bare count cannot be converted to weight. Fluid ounces and other volume units are not converted to pounds. Capacity and serving-size phrases are excluded when recognized.

The ranking uses the displayed item price. Shipping, taxes, clipped coupons and subscription adjustments are not added. The script sorts only loaded products on the current page; different result containers are sorted separately. Product nodes, links, ordinary sponsored labels, nonproduct banners, pagination and Amazon's existing filters are preserved. Turning sorting off restores the order first observed for those product nodes. Dynamically appended products are recalculated.

Seller titles can still be wrong or omit essential pack details. Verify the size and final checkout price before buying. The script does not fetch product pages or send browsing data anywhere. Only the selected display unit and on/off setting are saved in Tampermonkey storage.

## Validation

The test suite checks title parsing, the reported VELCRO roll and 100-sheet transparency-film listings, reversed and compact dimension pairs, conflicting sizes/totals, the three requested label cases, rounding, weight/volume/count/length multipacks, sheet unit rates, capacity exclusions, incompatible quantities, native-menu changes and destinations, saved choices, stable sorting, DOM-node preservation, restoration and dynamic updates. The dark local preview reproduces the reported sheet titles and prices among invented offers using the actual userscript and the relevant Amazon sort-menu markup. Live Amazon/Tampermonkey operation remains unverified in this development session.

For development with Node.js 24 or later:

```powershell
Set-Location '<your-checkout>\amazon-unit-price'
npm install
npm run check
npm test
npm run release
npm run preview
```

Then open `http://127.0.0.1:8768/s`. The preview binds only to localhost and exits after 15 minutes.

Every delivered userscript filename includes its version. `npm run release` generates `amazon-unit-price-<version>.user.js` from the development source and checks that its metadata version and license match `package.json`.

## Source and updates

The public source is [Farris-Rankin/amazon-unit-price](https://github.com/Farris-Rankin/amazon-unit-price). A GitHub push webhook notifies Greasy Fork when the stable development filename on `main` changes; versioned files remain available for manual installation. Script updates must increase `@version` and the matching package version so installed users can receive them.

## License

The current release is licensed under [MIT](LICENSE). The full copyright and license notice is also included in the userscript so it accompanies copies posted on Greasy Fork. Modification and redistribution are allowed when the copyright and license notices are retained.

Primary installation references: [Brave extensions](https://brave.com/learn/using-chrome-extensions-in-brave/), [Tampermonkey script installation](https://www.tampermonkey.net/faq.php?q=Q102), and [userscript permission](https://www.tampermonkey.net/faq.php?q=Q209).

Unit references: [NIST unit pricing guide](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/1181e2025/NIST.SP.1181e2025.html) and [NIST conversion factors](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9).
