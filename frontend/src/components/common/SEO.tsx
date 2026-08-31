import { useEffect } from 'react';

/**
 * Lightweight head-tag manager — no react-helmet dependency.
 *
 * Sets the document `<title>` and a small set of SEO / Open Graph / Schema.org
 * / Dublin Core / canonical tags. Cleans them up when the component unmounts
 * so cross-page navigation doesn't leave stale metadata behind.
 */

type MetaKind = 'name' | 'property';

interface SchemaObject {
    [key: string]: any;
}

interface SEOProps {
    title: string;
    description?: string;
    canonical?: string;
    image?: string;
    type?: 'website' | 'article';
    authors?: string[];
    publishedTime?: string;
    keywords?: string[];
    doi?: string;
    /** Full JSON-LD schema. Object or array; automatically wrapped in a `<script>` tag. */
    schema?: SchemaObject | SchemaObject[];
}

const upsertMeta = (kind: MetaKind, key: string, value: string): HTMLMetaElement => {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${kind}="${key}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute(kind, key);
        document.head.appendChild(el);
    }
    el.setAttribute('content', value);
    return el;
};

const upsertLink = (rel: string, href: string): HTMLLinkElement => {
    let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
    }
    el.setAttribute('href', href);
    return el;
};

const upsertSchema = (schema: SchemaObject | SchemaObject[]): HTMLScriptElement => {
    let el = document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"][data-seo="1"]');
    if (!el) {
        el = document.createElement('script');
        el.setAttribute('type', 'application/ld+json');
        el.setAttribute('data-seo', '1');
        document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
    return el;
};

const SEO: React.FC<SEOProps> = ({
    title,
    description,
    canonical,
    image,
    type = 'website',
    authors,
    publishedTime,
    keywords,
    doi,
    schema,
}) => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = title;

        const created: (HTMLElement | null)[] = [];

        if (description) {
            created.push(upsertMeta('name', 'description', description));
            created.push(upsertMeta('property', 'og:description', description));
            created.push(upsertMeta('name', 'twitter:description', description));
        }
        created.push(upsertMeta('property', 'og:title', title));
        created.push(upsertMeta('property', 'og:type', type));
        created.push(upsertMeta('name', 'twitter:title', title));
        created.push(upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary'));

        if (image) {
            created.push(upsertMeta('property', 'og:image', image));
            created.push(upsertMeta('name', 'twitter:image', image));
        }
        if (canonical) {
            created.push(upsertLink('canonical', canonical));
            created.push(upsertMeta('property', 'og:url', canonical));
        }
        if (keywords && keywords.length) {
            created.push(upsertMeta('name', 'keywords', keywords.join(', ')));
        }
        // Dublin Core
        created.push(upsertMeta('name', 'DC.Title', title));
        if (description) created.push(upsertMeta('name', 'DC.Description', description));
        if (authors) {
            authors.forEach((a) => created.push(upsertMeta('name', 'DC.Creator', a)));
        }
        if (publishedTime) {
            created.push(upsertMeta('name', 'DC.Date', publishedTime));
            created.push(upsertMeta('property', 'article:published_time', publishedTime));
        }
        if (doi) {
            created.push(upsertMeta('name', 'citation_doi', doi));
            created.push(upsertMeta('name', 'DC.Identifier', doi));
        }
        if (schema) {
            upsertSchema(schema);
        }

        return () => {
            document.title = previousTitle;
            // Leave the tags in place — subsequent SEO components overwrite them.
        };
    }, [title, description, canonical, image, type, authors, publishedTime, keywords, doi, schema]);

    return null;
};

export default SEO;
