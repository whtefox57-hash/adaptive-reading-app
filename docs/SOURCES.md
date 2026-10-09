# Source inventory and permissions

Three book records, three normalized source editions, ten prepared openings. Their complete source text and full embedded Gutenberg licenses ship in `data/sources/`; no external manuscript fetch is required at startup.

| Source | Edition evidence | Prepared openings |
| --- | --- | --- |
| The Autobiography of Benjamin Franklin | Gutenberg #148; Charles W. Eliot, editor; P. F. Collier & Son, 1909; Gutenberg update 2014 | Self-education; the Junto; subscription library; moral habits |
| Autobiography of Andrew Carnegie | Gutenberg #17976; John C. Van Dyke, editor; autobiography published 1920; Gutenberg release 2006 | Messenger opportunity; telegraph practice; steel rails |
| Memoirs of Napoleon Bonaparte — Complete | Louis Antoine Fauvelet de Bourrienne; Gutenberg #3567; collected edition dated 1891 in source; update 2013; translator not attributed in file | School friendship; ambition after victory; Egyptian expedition |

Bourrienne's claims are attributed memoir, not automatically established history. The collected text includes editorial annotations and competing interpretations. Franklin's introduction and Carnegie's editorial material are retained in the original source; prepared excerpts use the author's narrative sections. Source locations are normalized character offsets, never invented page numbers.

`manifest.json` records exact immutable Git mirror URLs/commits, original byte SHA-256, normalized UTF-8 SHA-256, retrieval date, and verification limitation. CRLF is normalized to LF after decoding; wording and punctuation are unchanged. Application excerpts always use stored start/end offsets and are checked against the stored source. Each actual session has its own manifest and stored span.

Direct Gutenberg download attempts returned proxy 403. The mirrors were available through the existing authenticated Git/HTTPS routes. This is mirror-backed verification, not a claim of a successful direct official-site check. The saved network draft adds `gutenberg.org` and `www.gutenberg.org`; that does not itself change the current network.

The embedded licenses declare public-domain availability in the United States and warn that other countries may have different laws. The app requires explicit US access confirmation and blocks unconfirmed territory. This is a test-access restriction, not IP-based territorial enforcement or worldwide legal clearance. A public release needs a territorial review and suitable deployment controls.

Source text, full license, attribution, the required license notice, and an immediate full-license link are provided in the reader. No fee is charged and billing is off. Reading Studio is independent; Project Gutenberg does not endorse it. Redistribution of this repository must retain the included source licenses. No publisher is contacted and no modern retail copy is treated as a distribution license.

Rights are stored separately for display, summaries, adaptation, cross-book assembly, visuals, audio, caching and model processing. Current US sources allow non-audio uses under the recorded public-domain/embedded-license basis. Audio is off. Unknown permissions deny the affected use. Source ingestion creates unknown rights with every use disabled. Changing rights is an administrator action with recorded evidence, and prepared/cached access rechecks rights and expiry.

Prepared commentary is hand-authored for each opening, with explicit perspective/interpretation labels. Duration extension adds exact original paragraphs, not new invented summaries. Extended original context is not described as editorially summarized. The visuals are conceptual connections, not quantitative charts or causal measurements. The initial editorial set comprises contrasting Learning/Craft and Strategy/History profiles; automated checks confirm different selections and exact quotations. Historical fidelity still needs independent editorial review before public release.
