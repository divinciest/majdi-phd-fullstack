"""
PDF Report Generator for Extraction Runs

Generates comprehensive PDF reports including:
- Run metadata and configuration
- Extracted data summary
- Validation results and metrics
- Data tables
"""

import os
import json
from datetime import datetime
from typing import Dict, Any, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT


def generate_run_report(
    run_data: Dict[str, Any],
    extracted_data: List[Dict[str, Any]],
    validated_data: Optional[List[Dict[str, Any]]],
    validation_report: Optional[Dict[str, Any]],
    output_path: str,
    schema_fields: Optional[List[str]] = None
) -> str:
    """
    Generate a comprehensive PDF report for an extraction run.
    
    Args:
        run_data: Run metadata from database
        extracted_data: All extracted entries
        validated_data: Filtered/accepted entries (if validation enabled)
        validation_report: Validation results (if validation enabled)
        output_path: Path to save the PDF
        schema_fields: List of schema field names
        
    Returns:
        Path to generated PDF
    """
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=1*cm,
        leftMargin=1*cm,
        topMargin=1.5*cm,
        bottomMargin=1.5*cm
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=30,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#1a1a2e')
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        spaceBefore=20,
        spaceAfter=10,
        textColor=colors.HexColor('#16213e')
    )
    
    subheading_style = ParagraphStyle(
        'CustomSubheading',
        parent=styles['Heading3'],
        fontSize=12,
        spaceBefore=15,
        spaceAfter=8,
        textColor=colors.HexColor('#0f3460')
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=6
    )
    
    small_style = ParagraphStyle(
        'CustomSmall',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.grey
    )
    
    elements = []
    
    # Title
    run_name = run_data.get('name', 'Extraction Run')
    elements.append(Paragraph(f"Extraction Report: {run_name}", title_style))
    elements.append(Paragraph(
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        small_style
    ))
    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    elements.append(Spacer(1, 20))
    
    # Run Overview Section
    elements.append(Paragraph("1. Run Overview", heading_style))
    
    overview_data = [
        ["Property", "Value"],
        ["Run ID", run_data.get('id', 'N/A')],
        ["Name", run_data.get('name', 'N/A')],
        ["Status", run_data.get('status', 'N/A')],
        ["Source Type", run_data.get('source_type', 'N/A')],
        ["LLM Provider", run_data.get('llm_provider', 'N/A')],
        ["Sources Count", str(run_data.get('sources_count', 0))],
        ["Start Date", run_data.get('start_date', 'N/A')],
        ["Created At", run_data.get('created_at', 'N/A')],
    ]
    
    overview_table = Table(overview_data, colWidths=[4*cm, 12*cm])
    overview_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(overview_table)
    elements.append(Spacer(1, 20))
    
    # Extraction Summary Section
    elements.append(Paragraph("2. Extraction Summary", heading_style))
    
    total_extracted = len(extracted_data)
    total_validated = len(validated_data) if validated_data else 0
    validation_enabled = validation_report is not None
    
    summary_data = [
        ["Metric", "Value"],
        ["Total Entries Extracted", str(total_extracted)],
        ["Validation Enabled", "Yes" if validation_enabled else "No"],
    ]
    
    if validation_enabled:
        pass_rate = validation_report.get('summary', {}).get('overall_pass_rate', 0)
        summary_data.extend([
            ["Validated (Accepted) Entries", str(total_validated)],
            ["Rejected Entries", str(total_extracted - total_validated)],
            ["Validation Pass Rate", f"{pass_rate:.1%}" if isinstance(pass_rate, float) else str(pass_rate)],
        ])
    
    summary_table = Table(summary_data, colWidths=[6*cm, 10*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # Validation Results Section (if enabled)
    if validation_enabled and validation_report:
        elements.append(Paragraph("3. Validation Results", heading_style))
        
        # Validation summary
        val_summary = validation_report.get('summary', {})
        val_summary_data = [
            ["Metric", "Value"],
            ["Total Rows Validated", str(val_summary.get('total_rows', 0))],
            ["Overall Pass Rate", f"{val_summary.get('overall_pass_rate', 0):.1%}" if isinstance(val_summary.get('overall_pass_rate', 0), float) else "N/A"],
            ["Total Rules", str(val_summary.get('total_rules', 0))],
            ["Enabled Rules", str(val_summary.get('enabled_rules', 0))],
        ]
        
        val_table = Table(val_summary_data, colWidths=[6*cm, 10*cm])
        val_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(val_table)
        elements.append(Spacer(1, 15))
        
        # Rules breakdown
        all_results = validation_report.get('all_results', [])
        if all_results:
            elements.append(Paragraph("Validation Rules", subheading_style))
            
            rules_data = [["Rule ID", "Status", "Message"]]
            for result in all_results[:20]:  # Limit to 20 rules
                status = "PASS" if result.get('passed', False) else "FAIL"
                rules_data.append([
                    result.get('rule_id', 'N/A'),
                    status,
                    result.get('message', 'N/A')[:60]
                ])
            
            rules_table = Table(rules_data, colWidths=[3*cm, 2*cm, 11*cm])
            rules_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            elements.append(rules_table)
        
        elements.append(Spacer(1, 20))
    
    # Page break before data tables
    elements.append(PageBreak())
    
    # Extracted Data Section
    section_num = 4 if validation_enabled else 3
    elements.append(Paragraph(f"{section_num}. Extracted Data (First 50 Rows)", heading_style))
    
    if extracted_data and len(extracted_data) > 0:
        # Determine columns to show
        if schema_fields:
            columns = schema_fields[:8]  # Limit columns for readability
        else:
            sample = extracted_data[0]
            columns = [k for k in sample.keys() if k not in ('__source', '__url', 'row_accept_candidate')][:8]
        
        # Add source column
        display_columns = ['Source'] + columns
        
        # Build table data
        table_data = [display_columns]
        for entry in extracted_data[:50]:  # Limit to 50 rows
            row = [str(entry.get('__source', ''))[:25]]
            for col in columns:
                val = entry.get(col, '')
                row.append(str(val)[:30] if val else '')
            table_data.append(row)
        
        # Calculate column widths
        col_width = 16*cm / len(display_columns)
        col_widths = [col_width] * len(display_columns)
        
        data_table = Table(table_data, colWidths=col_widths)
        data_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#16213e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ]))
        elements.append(data_table)
        
        if len(extracted_data) > 50:
            elements.append(Spacer(1, 10))
            elements.append(Paragraph(
                f"... and {len(extracted_data) - 50} more rows (showing first 50)",
                small_style
            ))
    else:
        elements.append(Paragraph("No data extracted.", normal_style))
    
    # Validated Data Section (if different from extracted)
    if validation_enabled and validated_data and len(validated_data) > 0:
        elements.append(PageBreak())
        section_num += 1
        elements.append(Paragraph(f"{section_num}. Validated Data (First 50 Accepted Rows)", heading_style))
        
        if schema_fields:
            columns = schema_fields[:8]
        else:
            sample = validated_data[0]
            columns = [k for k in sample.keys() if k not in ('__source', '__url', 'row_accept_candidate')][:8]
        
        display_columns = ['Source'] + columns
        
        table_data = [display_columns]
        for entry in validated_data[:50]:
            row = [str(entry.get('__source', ''))[:25]]
            for col in columns:
                val = entry.get(col, '')
                row.append(str(val)[:30] if val else '')
            table_data.append(row)
        
        col_width = 16*cm / len(display_columns)
        col_widths = [col_width] * len(display_columns)
        
        val_data_table = Table(table_data, colWidths=col_widths)
        val_data_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f3460')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#e8f4e8')]),
        ]))
        elements.append(val_data_table)
        
        if len(validated_data) > 50:
            elements.append(Spacer(1, 10))
            elements.append(Paragraph(
                f"... and {len(validated_data) - 50} more accepted rows (showing first 50)",
                small_style
            ))
    
    # Footer
    elements.append(Spacer(1, 30))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph(
        f"Report generated by CretExtract • Run ID: {run_data.get('id', 'N/A')}",
        small_style
    ))
    
    # Build PDF
    doc.build(elements)
    
    return output_path


def generate_report_from_run_dir(
    run_id: str,
    run_data: Dict[str, Any],
    output_dir: str,
    report_output_path: str
) -> str:
    """
    Generate report by reading files from run output directory.
    
    Args:
        run_id: Run ID
        run_data: Run metadata
        output_dir: Run's output directory
        report_output_path: Where to save the PDF
        
    Returns:
        Path to generated PDF
    """
    # Load extracted data
    extracted_data = []
    global_json = os.path.join(output_dir, "global_data.json")
    if os.path.exists(global_json):
        with open(global_json, "r", encoding="utf-8") as f:
            extracted_data = json.load(f)
            if not isinstance(extracted_data, list):
                extracted_data = [extracted_data] if extracted_data else []
    
    # Load validated data
    validated_data = None
    validated_json = os.path.join(output_dir, "validated_data.json")
    if os.path.exists(validated_json):
        with open(validated_json, "r", encoding="utf-8") as f:
            validated_data = json.load(f)
            if not isinstance(validated_data, list):
                validated_data = [validated_data] if validated_data else []
    
    # Load validation report
    validation_report = None
    validation_report_path = os.path.join(output_dir, "validation", "validation_report.json")
    if os.path.exists(validation_report_path):
        with open(validation_report_path, "r", encoding="utf-8") as f:
            validation_report = json.load(f)
    
    # Load schema fields
    schema_fields = None
    schema_mapping_path = os.path.join(output_dir, "schema_mapping.json")
    if os.path.exists(schema_mapping_path):
        with open(schema_mapping_path, "r", encoding="utf-8") as f:
            schema_mapping = json.load(f)
            if 'fields' in schema_mapping:
                schema_fields = schema_mapping['fields']
            elif 'fieldDefs' in schema_mapping:
                schema_fields = [f.get('name') for f in schema_mapping['fieldDefs'] if f.get('name')]
    
    return generate_run_report(
        run_data=run_data,
        extracted_data=extracted_data,
        validated_data=validated_data,
        validation_report=validation_report,
        output_path=report_output_path,
        schema_fields=schema_fields
    )
