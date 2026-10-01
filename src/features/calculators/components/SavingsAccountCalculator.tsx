"use client";

import DepositLikeCalculator from "./DepositLikeCalculator";

export default function SavingsAccountCalculator() {
  return (
    <DepositLikeCalculator
      namespace="cuenta-remunerada"
      principalKey="balance"
      defaultPrincipal={10000}
      defaultApr={2.5}
    />
  );
}
