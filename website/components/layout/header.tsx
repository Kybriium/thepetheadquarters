"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, ShoppingCart, X, ArrowRight, UserCircle, LogOut, Shield } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { CartPopup } from "./cart-popup";
import { SearchOverlay } from "./search-overlay";
import { NavMenuTab, NavMenuPanel, type NavMenuKey } from "./nav-mega-menu";

interface HeaderProps {
  dict: {
    home: string;
    products: string;
    categories: string;
    brands: string;
    about: string;
    contact: string;
    search: string;
    cart: string;
  };
}

/**
 * Nav config — flat links by default, but `dropdown` opt-in turns a
 * tab into a click-to-open menu trigger (see <NavMenuTab/>). The
 * dropdown panel itself renders once below the nav row, full width,
 * and swaps content based on which tab is active.
 */
const navLinks: ReadonlyArray<{
  key: "products" | "categories" | "brands" | "about" | "contact";
  href: string;
  dropdown?: NavMenuKey;
}> = [
  { key: "products", href: "/products" },
  { key: "categories", href: "/categories", dropdown: "categories" },
  { key: "brands", href: "/brands", dropdown: "brands" },
  { key: "about", href: "/about" },
  { key: "contact", href: "/contact" },
];

export function Header({ dict }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Single source of truth for which nav dropdown is open. Replaces
  // the previous per-menu hover state, which let two panels appear at
  // once on a fast cursor sweep.
  const [activeMenu, setActiveMenu] = useState<NavMenuKey | null>(null);
  const pathname = usePathname();
  const { totalItems, drawerOpen } = useCart();
  const { user, isAuthenticated, isStaff, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const cartRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-open popup when item is added via context
  useEffect(() => {
    if (drawerOpen) setCartOpen(true);
  }, [drawerOpen]);

  // Close popup on click outside
  useEffect(() => {
    if (!cartOpen) return;
    function onClick(e: MouseEvent) {
      if (cartRef.current && !cartRef.current.contains(e.target as Node)) {
        setCartOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [cartOpen]);

  // Close user menu on click outside
  useEffect(() => {
    if (!userMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [userMenuOpen]);

  // Close popups + dropdowns on navigation so menus don't linger
  // after a click. activeMenu is included here so clicking "View all"
  // (or any link inside the panel) collapses the menu cleanly.
  useEffect(() => {
    setCartOpen(false);
    setUserMenuOpen(false);
    setActiveMenu(null);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <header
        className="sticky top-0 z-50 transition-all duration-500"
        style={{
          background: scrolled ? "rgba(244, 241, 234, 0.92)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled ? "1px solid var(--bg-border)" : "1px solid transparent",
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 transition-transform duration-300 hover:scale-[1.02]">
            <Image
              src="/img/logo.png"
              alt="The Pet Headquarters"
              width={40}
              height={40}
              className="rounded-full"
              priority
            />
            <span
              className="hidden sm:block"
              style={{
                fontFamily: "var(--font-cormorant)",
                fontSize: "var(--text-lg)",
                fontWeight: "var(--weight-medium)",
                color: "var(--white)",
                letterSpacing: "var(--tracking-wide)",
              }}
            >
              The Pet Headquarters
            </span>
          </Link>

          {/* Desktop nav — dropdown-enabled tabs are buttons that
              toggle the single shared `activeMenu`. Flat links stay
              as plain anchors. */}
          <nav className="hidden items-center gap-1 lg:flex" data-nav-menu="row">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
              if (link.dropdown) {
                const dropdownKey = link.dropdown;
                return (
                  // Wrap each tab with data-nav-menu="tab" so the panel's
                  // outside-click handler can distinguish clicks on tabs
                  // (toggle is handled by onClick) from real outside clicks.
                  <div key={link.key} data-nav-menu="tab">
                    <NavMenuTab
                      href={link.href}
                      label={dict[link.key]}
                      menuKey={dropdownKey}
                      isActive={isActive}
                      isOpen={activeMenu === dropdownKey}
                      onToggle={() =>
                        setActiveMenu((cur) => (cur === dropdownKey ? null : dropdownKey))
                      }
                    />
                  </div>
                );
              }
              return (
                <Link
                  key={link.key}
                  href={link.href}
                  className="relative px-4 py-2 transition-colors duration-200 hover:text-[var(--gold)]"
                  style={{
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "var(--text-sm)",
                    fontWeight: "var(--weight-medium)",
                    color: isActive ? "var(--gold)" : "var(--white-dim)",
                    letterSpacing: "var(--tracking-wide)",
                  }}
                >
                  {dict[link.key]}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
                      style={{ background: "var(--gold)" }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setSearchOpen(!searchOpen); setMobileOpen(false); }}
              aria-label={searchOpen ? "Close search" : "Open search"}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 hover:bg-[rgba(187,148,41,0.1)] hover:text-[var(--gold)]"
              style={{ color: searchOpen ? "var(--gold)" : "var(--white-dim)" }}
            >
              {searchOpen ? <X size={18} /> : <Search size={18} />}
            </button>

            <div ref={cartRef} className="relative">
            <button
              onClick={() => { setCartOpen(!cartOpen); setSearchOpen(false); setMobileOpen(false); }}
              aria-label={totalItems > 0 ? `Open cart (${totalItems} items)` : "Open cart"}
              className="relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 hover:bg-[rgba(187,148,41,0.1)] hover:text-[var(--gold)]"
              style={{ color: cartOpen ? "var(--gold)" : "var(--white-dim)" }}
            >
              <ShoppingCart size={18} />
              {totalItems > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full"
                  style={{
                    background: "var(--gold)",
                    color: "var(--black)",
                    fontFamily: "var(--font-montserrat)",
                    fontSize: "10px",
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </button>
            <CartPopup open={cartOpen} onClose={() => setCartOpen(false)} />
            </div>

            {/* User icon */}
            <div ref={userRef} className="relative">
              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => { setUserMenuOpen(!userMenuOpen); setSearchOpen(false); setCartOpen(false); setMobileOpen(false); }}
                    aria-label="Open account menu"
                    className="relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 hover:bg-[rgba(187,148,41,0.1)] hover:text-[var(--gold)]"
                    style={{ color: userMenuOpen ? "var(--gold)" : "var(--white-dim)" }}
                  >
                    <UserCircle size={18} />
                    {user && !user.is_email_verified && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: "var(--warning)" }} />
                    )}
                  </button>
                  {/* User dropdown */}
                  <div
                    className="absolute right-0 top-12 w-48 overflow-hidden rounded-lg transition-all duration-200"
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--bg-border)",
                      boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
                      opacity: userMenuOpen ? 1 : 0,
                      transform: userMenuOpen ? "translateY(0)" : "translateY(-8px)",
                      pointerEvents: userMenuOpen ? "all" : "none",
                    }}
                  >
                    <div style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--bg-border)" }}>
                      <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {user?.email}
                      </p>
                    </div>
                    <Link
                      href="/account"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex w-full items-center gap-2 px-4 py-2.5 transition-colors duration-200 hover:bg-[rgba(187,148,41,0.08)]"
                      style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}
                    >
                      <UserCircle size={14} />
                      My Account
                    </Link>
                    {isStaff && (
                      <Link
                        href="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex w-full items-center gap-2 px-4 py-2.5 transition-colors duration-200 hover:bg-[rgba(187,148,41,0.08)]"
                        style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--gold-dark)", fontWeight: "var(--weight-medium)" }}
                      >
                        <Shield size={14} />
                        Admin
                      </Link>
                    )}
                    <button
                      onClick={() => { setUserMenuOpen(false); logout(); }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 transition-colors duration-200 hover:bg-[rgba(198,40,40,0.08)]"
                      style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}
                    >
                      <LogOut size={14} />
                      Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <Link
                  href="/account/login"
                  aria-label="Sign in"
                  className="flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 hover:bg-[rgba(187,148,41,0.1)] hover:text-[var(--gold)]"
                  style={{ color: "var(--white-dim)" }}
                >
                  <UserCircle size={18} />
                </Link>
              )}
            </div>

            <button
              onClick={() => { setMobileOpen(!mobileOpen); setSearchOpen(false); }}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 hover:bg-[rgba(187,148,41,0.1)] lg:hidden"
              style={{ color: mobileOpen ? "var(--gold)" : "var(--white-dim)" }}
            >
              <div className="relative h-4 w-5">
                <span
                  className="absolute left-0 h-[1.5px] w-full rounded-full transition-all duration-300"
                  style={{
                    background: mobileOpen ? "var(--gold)" : "var(--white-dim)",
                    top: mobileOpen ? "50%" : "0%",
                    transform: mobileOpen ? "rotate(45deg)" : "none",
                  }}
                />
                <span
                  className="absolute left-0 top-1/2 h-[1.5px] w-full rounded-full transition-all duration-300"
                  style={{
                    background: "var(--white-dim)",
                    opacity: mobileOpen ? 0 : 1,
                    transform: "translateY(-50%)",
                  }}
                />
                <span
                  className="absolute left-0 h-[1.5px] w-full rounded-full transition-all duration-300"
                  style={{
                    background: mobileOpen ? "var(--gold)" : "var(--white-dim)",
                    bottom: mobileOpen ? "auto" : "0%",
                    top: mobileOpen ? "50%" : "auto",
                    transform: mobileOpen ? "rotate(-45deg)" : "none",
                  }}
                />
              </div>
            </button>
          </div>
        </div>

        {/* Single full-width dropdown rendered below the nav row.
            Pinned to the header so it always anchors flush left/right
            — no sideways drift no matter which tab opens it. Content
            swaps based on which menu is active. */}
        <NavMenuPanel activeKey={activeMenu} onClose={() => setActiveMenu(null)} />
      </header>

      {/* Full-screen focused search modal — replaces the old inline
          search bar. Triggered from the header search button. */}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Mobile fullscreen overlay menu */}
      <div
        className="fixed inset-0 z-40 flex flex-col transition-all duration-500 lg:hidden"
        style={{
          background: "var(--bg-primary)",
          opacity: mobileOpen ? 1 : 0,
          pointerEvents: mobileOpen ? "all" : "none",
          transform: mobileOpen ? "none" : "translateY(-20px)",
        }}
      >
        {/* Spacer for header height */}
        <div className="h-16" />

        <nav className="flex flex-1 flex-col justify-center px-8">
          {navLinks.map((link, i) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
            <Link
              key={link.key}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="group flex items-center justify-between border-b py-5 transition-all duration-300"
              style={{
                borderColor: isActive ? "var(--gold)" : "var(--bg-border)",
                opacity: mobileOpen ? 1 : 0,
                transform: mobileOpen ? "none" : "translateX(-30px)",
                transitionDelay: mobileOpen ? `${i * 80}ms` : "0ms",
              }}
            >
              <span
                className="transition-colors duration-200 group-hover:text-[var(--gold)]"
                style={{
                  fontFamily: "var(--font-cormorant)",
                  fontSize: "var(--text-3xl)",
                  fontWeight: "var(--weight-regular)",
                  color: isActive ? "var(--gold)" : "var(--white)",
                }}
              >
                {dict[link.key]}
              </span>
              <ArrowRight
                size={20}
                className="transition-all duration-300 group-hover:translate-x-1"
                style={{ color: "var(--gold)", opacity: 0.5 }}
              />
            </Link>
            );
          })}
        </nav>

        {/* Bottom info */}
        <div className="px-8 pb-10">
          <div
            style={{ width: 40, height: 1, background: "var(--gold)", marginBottom: "var(--space-4)" }}
          />
          <p
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              color: "var(--white-faint)",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            Premium products for your beloved companions.
          </p>
        </div>
      </div>
    </>
  );
}
