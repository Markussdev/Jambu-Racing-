class SupabaseManager {
  constructor() {
    this.client = supabaseClient;
    this.channel = null;
    console.log("Supabase inicializado com sucesso");
  }

  mapNumberRow(row) {
    return {
      number: row.number,
      status: row.status,
      reservedAt: row.reserved_at,
      reservedUntil: row.reserved_until,
      soldAt: row.sold_at,
      confirmedAt: row.confirmed_at,
      currentTransactionId: row.current_transaction_id,
      manualEntry: row.manual_entry,
      manualReserve: row.manual_reserve,
      buyerInfo: null
    };
  }

  async getRaffleNumbers() {
    const { data, error } = await this.client
      .from("raffle_numbers")
      .select(`
        number,
        status,
        reserved_at,
        reserved_until,
        sold_at,
        confirmed_at,
        current_transaction_id,
        manual_entry,
        manual_reserve
      `)
      .order("number", { ascending: true });

    if (error) {
      console.error("Erro ao buscar números:", error);
      throw error;
    }

    const numbers = {};

    data.forEach((row) => {
      numbers[row.number.toString()] = this.mapNumberRow(row);
    });

    console.log("Números carregados:", Object.keys(numbers).length);
    return numbers;
  }

  async cleanupExpiredReservations() {
    const { data, error } = await this.client.rpc("cleanup_expired_reservations");

    if (error) {
      console.error("Erro ao limpar reservas expiradas:", error);
      return 0;
    }

    return data || 0;
  }

  async reserveNumbers(selectedNumbers, buyerInfo) {
    const buyerName = `${buyerInfo.firstName} ${buyerInfo.lastName}`.trim();

    const { data, error } = await this.client.rpc("reserve_numbers", {
      p_numbers: selectedNumbers,
      p_buyer_name: buyerName,
      p_buyer_phone: buyerInfo.phone,
      p_buyer_email: buyerInfo.email || null
    });

    if (error) {
      console.error("Erro ao reservar números:", error);
      throw error;
    }

    return data;
  }

  listenToNumbersUpdates(callback) {
    if (this.channel) {
      this.client.removeChannel(this.channel);
      this.channel = null;
    }

    this.channel = this.client
      .channel("raffle-numbers-public")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "raffle_numbers"
        },
        (payload) => {
          const row = payload.new;
          const numbers = {};
          numbers[row.number.toString()] = this.mapNumberRow(row);
          callback(numbers);
        }
      )
      .subscribe();

    return this.channel;
  }
}
