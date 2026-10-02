from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='AnalysisRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('provider', models.CharField(blank=True, default='', max_length=32)),
                ('moisture_level', models.FloatField(blank=True, null=True)),
                ('needs_revive', models.BooleanField(default=False)),
                ('session_key', models.CharField(blank=True, default='', max_length=64)),
                ('user_agent', models.CharField(blank=True, default='', max_length=255)),
            ],
            options={
                'verbose_name': 'Completed analysis',
                'verbose_name_plural': 'Completed analyses',
                'ordering': ['-created_at'],
            },
        ),
    ]
