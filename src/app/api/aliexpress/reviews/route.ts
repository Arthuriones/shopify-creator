import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // To do: implement actual scraping logic here to get reviews for the URL
  // We'll generate a generic CSV for demonstration
  
  const csvHeaders = ["Rating", "Author", "Date", "Content", "Images"];
  const csvRows = [
    ["5", "Maria S.", "2023-10-15", "Produto excelente, chegou super rápido!", ""],
    ["5", "João B.", "2023-11-02", "Muito bom, a qualidade me surpreendeu.", "https://example.com/img1.jpg"],
    ["4", "Ana P.", "2023-11-20", "Gostei, mas a caixa veio um pouco amassada.", ""],
    ["5", "Carlos R.", "2023-12-05", "Exatamente como na foto. Recomendo o vendedor.", "https://example.com/img2.jpg"],
    ["5", "Juliana M.", "2024-01-10", "Perfeito! Comprarei mais vezes.", "https://example.com/img3.jpg"]
  ];

  const csvContent = [
    csvHeaders.join(","),
    ...csvRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
  ].join("\n");

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=reviews.csv"
    }
  });
}
