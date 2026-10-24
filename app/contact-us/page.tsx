import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
export const metadata: Metadata = { title: "Contact" };
export default function ContactPage() {
  const whatsapp = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919492651908").replace(/\D/g, "");
  const phone = "+919492651908";
  return (
    <main id="main-content" className="site-shell page">
      <div className="eyebrow">WE’RE HERE TO HELP</div>
      <h1>Get in touch.</h1>
      <p className="lead">Questions about TrendEra or the upcoming launch? Send us a message and we’ll get back to you.</p>
      <div className="contact-grid">
        <div className="contact-details">
          <div className="detail"><label>WhatsApp</label><a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">Chat with TrendEra ↗</a></div>
          <div className="detail"><label>Call</label><a href={`tel:${phone}`}>+91 94926 51908</a></div>
          <div className="detail"><label>Location</label><p>Hyderabad, Telangana, India</p></div>
          <div className="detail"><label>Response time</label><p>We aim to respond as soon as possible.</p></div>
        </div>
        <ContactForm />
      </div>
    </main>
  );
}
