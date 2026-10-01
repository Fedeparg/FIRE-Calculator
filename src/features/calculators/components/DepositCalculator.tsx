"use client";

import DepositLikeCalculator from "./DepositLikeCalculator";

export default function DepositCalculator() {
  return (
    <DepositLikeCalculator
      namespace="deposito-plazo-fijo"
      principalKey="principal"
      defaultPrincipal={10000}
      defaultApr={3}
    />
  );
}
