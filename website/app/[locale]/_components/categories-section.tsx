import Link from "next/link";
import Image from "next/image";
import type { Category } from "@/types/category";

interface CategoriesSectionProps {
  dict: {
    title: string;
  };
  categories: Category[];
}

export function CategoriesSection({ dict, categories }: CategoriesSectionProps) {
  if (categories.length === 0) return null;

  return (
    <section className="py-10 md:py-14" style={{ background: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-6 flex items-baseline justify-between">
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
              fontWeight: "var(--weight-medium)",
              color: "var(--white)",
            }}
          >
            {dict.title}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4" data-animate="stagger">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/categories/${category.slug}`}
              className="card-hover group block overflow-hidden rounded-lg"
              style={{ background: "var(--bg-secondary)" }}
            >
              {category.image && (
                <div className="relative aspect-square overflow-hidden">
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="p-3 text-center sm:p-4">
                <h3
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontSize: "clamp(0.875rem, 2vw, 1.25rem)",
                    fontWeight: "var(--weight-medium)",
                    color: "var(--white)",
                  }}
                >
                  {category.name}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
