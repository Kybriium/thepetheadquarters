"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, MapPin, AlertCircle } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import { addressSchema, type AddressFormData } from "@/lib/validations/auth";
import { formatUkPostcode, usePostcodeAutoFill } from "@/lib/postcode-lookup";
import type { Address } from "@/types/auth";
import type enAuth from "@/i18n/dictionaries/en/auth.json";

interface AddressFormProps {
  dict: typeof enAuth;
  address: Address | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function AddressForm({ dict, address, onSaved, onCancel }: AddressFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues: address
      ? {
          label: address.label,
          full_name: address.full_name,
          address_line_1: address.address_line_1,
          address_line_2: address.address_line_2,
          city: address.city,
          county: address.county,
          postcode: address.postcode,
          country: address.country,
          phone: address.phone,
          is_default: address.is_default,
        }
      : { country: "GB", is_default: false },
  });

  const lookupStatus = usePostcodeAutoFill({
    postcode: watch("postcode") || "",
    setValue: (field, value, options) =>
      setValue(field as keyof AddressFormData, value, options),
    getValue: (field) => {
      const v = getValues(field as keyof AddressFormData);
      return typeof v === "string" ? v : "";
    },
  });

  async function onSubmit(data: AddressFormData) {
    const payload: AddressFormData = {
      ...data,
      postcode: data.postcode ? formatUkPostcode(data.postcode) : data.postcode,
    };
    if (address) {
      await apiClient.patch(endpoints.addresses.detail(address.id), payload);
    } else {
      await apiClient.post(endpoints.addresses.list, payload);
    }
    onSaved();
  }

  const labelStyle = {
    fontFamily: "var(--font-montserrat)",
    fontSize: "var(--text-xs)" as const,
    fontWeight: "var(--weight-medium)" as const,
    color: "var(--white-dim)",
    letterSpacing: "var(--tracking-wide)",
    textTransform: "uppercase" as const,
    display: "block" as const,
    marginBottom: "var(--space-2)",
  };

  const inputStyle = (hasError: boolean) => ({
    background: "var(--bg-tertiary)",
    border: `1px solid ${hasError ? "var(--error)" : "var(--bg-border)"}`,
    color: "var(--white)",
    fontFamily: "var(--font-montserrat)",
    fontSize: "var(--text-sm)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-3) var(--space-4)",
  });

  return (
    <div className="rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-8)" }}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div>
          <label style={labelStyle}>{dict.addresses.label}</label>
          <input {...register("label")} placeholder={dict.addresses.labelPlaceholder} className="w-full outline-none" style={inputStyle(false)} />
        </div>

        <div>
          <label style={labelStyle}>{dict.addresses.fullName}</label>
          <input {...register("full_name")} autoComplete="name" className="w-full outline-none" style={inputStyle(!!errors.full_name)} />
        </div>

        {/* Postcode first — auto-fills city/county once a valid UK postcode is entered. */}
        <div>
          <label style={labelStyle}>{dict.addresses.postcode}</label>
          <div className="relative">
            <input
              {...register("postcode")}
              autoComplete="postal-code"
              placeholder="e.g. SW1A 1AA"
              onBlur={(e) => {
                const formatted = formatUkPostcode(e.target.value);
                if (formatted !== e.target.value) {
                  setValue("postcode", formatted, { shouldValidate: true });
                }
              }}
              className="w-full outline-none uppercase"
              style={{
                ...inputStyle(!!errors.postcode || lookupStatus === "not_found"),
                paddingRight: 36,
                textTransform: "uppercase",
              }}
            />
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              style={{
                color:
                  lookupStatus === "ok" ? "var(--success)"
                  : lookupStatus === "not_found" ? "var(--error)"
                  : "var(--white-faint)",
              }}
            >
              {lookupStatus === "loading" && <Loader2 size={14} className="animate-spin" />}
              {lookupStatus === "ok" && <Check size={14} />}
              {lookupStatus === "not_found" && <AlertCircle size={14} />}
              {lookupStatus === "idle" && <MapPin size={14} />}
            </span>
          </div>
          {lookupStatus === "not_found" && (
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, color: "var(--error)", marginTop: "var(--space-1)" }}>
              Couldn&apos;t find that postcode. Fill in city &amp; county manually.
            </p>
          )}
        </div>

        <div>
          <label style={labelStyle}>{dict.addresses.addressLine1}</label>
          <input
            {...register("address_line_1")}
            autoComplete="address-line1"
            placeholder="House number and street"
            className="w-full outline-none"
            style={inputStyle(!!errors.address_line_1)}
          />
        </div>

        <div>
          <label style={labelStyle}>{dict.addresses.addressLine2}</label>
          <input
            {...register("address_line_2")}
            autoComplete="address-line2"
            placeholder="Apartment, suite, etc. (optional)"
            className="w-full outline-none"
            style={inputStyle(false)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>{dict.addresses.city}</label>
            <input {...register("city")} autoComplete="address-level2" className="w-full outline-none" style={inputStyle(!!errors.city)} />
          </div>
          <div>
            <label style={labelStyle}>{dict.addresses.county}</label>
            <input {...register("county")} autoComplete="address-level1" className="w-full outline-none" style={inputStyle(false)} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>{dict.addresses.phone}</label>
          <input {...register("phone")} autoComplete="tel" type="tel" className="w-full outline-none" style={inputStyle(false)} />
        </div>

        <div className="flex items-center gap-3">
          <input {...register("is_default")} type="checkbox" id="is_default" style={{ accentColor: "var(--gold)" }} />
          <label htmlFor="is_default" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}>
            {dict.addresses.setDefault}
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-gold rounded-md px-8 py-3 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
            style={{ fontFamily: "var(--font-montserrat)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-sm)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase" }}
          >
            {isSubmitting ? "..." : dict.addresses.save}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-6 py-3 transition-all duration-200"
            style={{ border: "1px solid var(--bg-border)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)" }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
