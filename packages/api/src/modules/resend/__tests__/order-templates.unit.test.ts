import { renderNotification } from "../templates";

const privateUrl = "http://localhost:3000/orders/track#token=signed-token&source=email";

it("renders a confirmation with the private tracking action in HTML and plain text", () => {
  const email = renderNotification("order-confirmed", {
    order_number: "PED-000000018",
    order_url: privateUrl,
  });
  expect(email.subject).toBe("usapeek: recibimos tu pedido PED-000000018");
  expect(email.html).toContain('href="http://localhost:3000/orders/track#token=signed-token&amp;source=email"');
  expect(email.text).toContain(`Seguir mi pedido: ${privateUrl}`);
  expect(email.text).toContain("sin iniciar sesión");
  expect(email.text).toContain("privado y vence en 90 días");
});

it("removes the account requirement from shipment emails while retaining tracking numbers", () => {
  const email = renderNotification("order-shipped", {
    order_number: "PED-000000018",
    order_url: privateUrl,
    tracking_numbers: ["TRACK-123"],
  });
  expect(email.text).toContain("sin iniciar sesión");
  expect(email.text).not.toContain("desde tu cuenta");
  expect(email.text).toContain("Número de seguimiento: TRACK-123");
  expect(email.text).toContain(`Seguir mi pedido: ${privateUrl}`);
});

it("escapes dynamic order and tracking values in HTML", () => {
  const email = renderNotification("order-shipped", {
    order_number: '<script>alert("order")</script>',
    order_url: privateUrl,
    tracking_numbers: ['<img src=x onerror="bad()">'],
  });
  expect(email.html).not.toContain("<script>");
  expect(email.html).not.toContain("<img");
  expect(email.html).toContain("&lt;script&gt;");
  expect(email.html).toContain("&lt;img");
});

it.each(["javascript:alert(1)", "https://user:password@example.com/orders/track"])(
  "rejects unsafe tracking action URLs (%s)",
  (orderUrl) => {
    expect(() => renderNotification("order-confirmed", {
      order_number: "PED-000000018",
      order_url: orderUrl,
    })).toThrow();
  },
);

it("rejects incomplete order notification data", () => {
  expect(() => renderNotification("order-confirmed", { order_url: privateUrl })).toThrow();
  expect(() => renderNotification("order-shipped", {
    order_number: "PED-000000018",
    order_url: privateUrl,
  })).toThrow();
});
